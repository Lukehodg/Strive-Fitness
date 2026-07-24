"""
StriveFreqAI — the "smartest ML model" strategy, built on Freqtrade's FreqAI.

FreqAI is a production ML pipeline: it engineers features, trains a model on a
rolling window, and continuously *retrains* as new data arrives — with automatic
feature scaling, outlier removal (SVM), and a dissimilarity-index (DI) gate that
suppresses predictions on market states unlike anything the model was trained
on. That DI gate is FreqAI's built-in analog of our "only trade when confident".

The feature design here follows Qlib's Alpha158 philosophy: breadth. We define a
compact set of base indicators, and FreqAI automatically expands each across
multiple lookback periods (`indicator_periods_candles`), multiple timeframes
(`include_timeframes`), correlated pairs (`include_corr_pairlist`), and shifted
copies (`include_shifted_candles`) — yielding hundreds of features for the model
to learn from, without hand-writing each one.

Target: the normalized mean forward return over `label_period_candles` bars.
Entry when the model predicts a positive move and the DI gate passes; exit when
the predicted move turns negative (plus ROI / stop / trailing-stop for risk).

Requires the `stable_freqai` image. Backtest first:
    freqtrade backtesting --strategy StriveFreqAI \\
        -c user_data/config.json -c user_data/config-freqai.json \\
        --freqaimodel LightGBMRegressor --timerange 20230101-
"""

import logging
from functools import reduce

import talib.abstract as ta
from pandas import DataFrame
from technical import qtpylib

from freqtrade.strategy import IStrategy

logger = logging.getLogger(__name__)


class StriveFreqAI(IStrategy):
    INTERFACE_VERSION = 3

    timeframe = "1h"
    can_short = False

    minimal_roi = {"0": 0.05, "240": 0.03, "720": 0.0}
    stoploss = -0.05
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True

    process_only_new_candles = True
    use_exit_signal = True
    startup_candle_count = 80

    # Predicted-return thresholds for entry/exit (tunable via hyperopt).
    entry_threshold = 0.01  # enter when predicted mean forward return > +1%
    exit_threshold = 0.0  # exit when it turns negative

    # -- Feature engineering ------------------------------------------------
    # `%`-prefixed columns are features. FreqAI expands these functions across
    # every period / timeframe / shift configured in config-freqai.json.

    def feature_engineering_expand_all(
        self, dataframe: DataFrame, period: int, metadata: dict, **kwargs
    ) -> DataFrame:
        dataframe["%-rsi-period"] = ta.RSI(dataframe, timeperiod=period)
        dataframe["%-mfi-period"] = ta.MFI(dataframe, timeperiod=period)
        dataframe["%-adx-period"] = ta.ADX(dataframe, timeperiod=period)
        dataframe["%-cci-period"] = ta.CCI(dataframe, timeperiod=period)
        dataframe["%-roc-period"] = ta.ROC(dataframe, timeperiod=period)

        # Moving-average ratios (trend / mean-reversion signal, Qlib-style).
        sma = ta.SMA(dataframe, timeperiod=period)
        dataframe["%-close_over_sma-period"] = dataframe["close"] / sma - 1
        ema = ta.EMA(dataframe, timeperiod=period)
        dataframe["%-close_over_ema-period"] = dataframe["close"] / ema - 1

        # Bollinger position and width.
        bb = qtpylib.bollinger_bands(
            qtpylib.typical_price(dataframe), window=period, stds=2.0
        )
        width = (bb["upper"] - bb["lower"]).replace(0, 1e-9)
        dataframe["%-bb_percent-period"] = (dataframe["close"] - bb["lower"]) / width
        dataframe["%-bb_width-period"] = width / bb["mid"]

        # Volatility measures.
        dataframe["%-atr-period"] = ta.ATR(dataframe, timeperiod=period) / dataframe["close"]
        dataframe["%-return_std-period"] = (
            dataframe["close"].pct_change().rolling(period).std()
        )

        # Range position over the window.
        roll_max = dataframe["high"].rolling(period).max()
        roll_min = dataframe["low"].rolling(period).min()
        rng = (roll_max - roll_min).replace(0, 1e-9)
        dataframe["%-range_pos-period"] = (dataframe["close"] - roll_min) / rng
        return dataframe

    def feature_engineering_expand_basic(
        self, dataframe: DataFrame, metadata: dict, **kwargs
    ) -> DataFrame:
        dataframe["%-pct_change"] = dataframe["close"].pct_change()
        dataframe["%-raw_volume"] = dataframe["volume"]
        dataframe["%-obv"] = ta.OBV(dataframe)
        macd = ta.MACD(dataframe)
        dataframe["%-macd"] = macd["macd"]
        dataframe["%-macdsignal"] = macd["macdsignal"]
        dataframe["%-macdhist"] = macd["macdhist"]
        return dataframe

    def feature_engineering_standard(
        self, dataframe: DataFrame, metadata: dict, **kwargs
    ) -> DataFrame:
        # Calendar features — crypto has weekday/hour seasonality.
        dataframe["%-day_of_week"] = dataframe["date"].dt.dayofweek
        dataframe["%-hour_of_day"] = dataframe["date"].dt.hour
        return dataframe

    def set_freqai_targets(
        self, dataframe: DataFrame, metadata: dict, **kwargs
    ) -> DataFrame:
        label_period = self.freqai_info["feature_parameters"]["label_period_candles"]
        # Target: normalized mean forward return over the label window.
        dataframe["&-s_close"] = (
            dataframe["close"]
            .shift(-label_period)
            .rolling(label_period)
            .mean()
            / dataframe["close"]
            - 1
        )
        return dataframe

    # -- Prediction wiring --------------------------------------------------

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Runs feature engineering + (re)training + prediction. Adds the
        # prediction column `&-s_close` and the `do_predict` gate.
        dataframe = self.freqai.start(dataframe, metadata, self)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = [
            dataframe["do_predict"] == 1,  # DI gate: model is confident
            dataframe["&-s_close"] > self.entry_threshold,
            dataframe["volume"] > 0,
        ]
        dataframe.loc[
            reduce(lambda a, b: a & b, conditions),
            ["enter_long", "enter_tag"],
        ] = (1, "freqai_long")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = [
            dataframe["do_predict"] == 1,
            dataframe["&-s_close"] < self.exit_threshold,
        ]
        dataframe.loc[
            reduce(lambda a, b: a & b, conditions),
            ["exit_long", "exit_tag"],
        ] = (1, "freqai_exit")
        return dataframe
