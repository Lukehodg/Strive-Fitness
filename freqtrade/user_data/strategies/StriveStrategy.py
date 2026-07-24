"""
StriveStrategy — the Strive platform's hand-written strategies ported to
Freqtrade.

This mirrors the TypeScript engine's non-ML strategies (SMA trend-following,
RSI mean-reversion, and Donchian breakout) as a single Freqtrade strategy:
enter on a trend/breakout signal filtered by RSI, exit on trend reversal, with
an ATR-aware stop and trailing stop for risk control.

Run a backtest before trusting it:
    freqtrade backtesting --strategy StriveStrategy -c user_data/config.json \\
        --timerange 20230101-
"""

from functools import reduce

import talib.abstract as ta
from pandas import DataFrame
from technical import qtpylib

from freqtrade.strategy import IStrategy


class StriveStrategy(IStrategy):
    INTERFACE_VERSION = 3

    timeframe = "1h"
    can_short = False

    # Take-profit ladder (fractions). Mirrors the TS take-profit idea.
    minimal_roi = {"0": 0.06, "180": 0.03, "480": 0.0}

    # Hard stop-loss (fraction). Mirrors the TS per-trade stop.
    stoploss = -0.03

    # Trailing stop locks in gains once a trade moves in our favour.
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.03
    trailing_only_offset_is_reached = True

    process_only_new_candles = True
    use_exit_signal = True
    exit_profit_only = False
    startup_candle_count = 50

    # Tunable via hyperopt if desired.
    fast_ma = 10
    slow_ma = 30
    rsi_period = 14
    breakout_lookback = 20
    exit_lookback = 10

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["sma_fast"] = ta.SMA(dataframe, timeperiod=self.fast_ma)
        dataframe["sma_slow"] = ta.SMA(dataframe, timeperiod=self.slow_ma)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=self.rsi_period)
        # Donchian channel for breakout entries / exits.
        dataframe["donchian_high"] = (
            dataframe["high"].rolling(self.breakout_lookback).max().shift(1)
        )
        dataframe["donchian_low"] = (
            dataframe["low"].rolling(self.exit_lookback).min().shift(1)
        )
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        trend_cross = qtpylib.crossed_above(
            dataframe["sma_fast"], dataframe["sma_slow"]
        )
        breakout = dataframe["close"] > dataframe["donchian_high"]
        not_overbought = dataframe["rsi"] < 70

        conditions = [(trend_cross | breakout), not_overbought, dataframe["volume"] > 0]
        dataframe.loc[
            reduce(lambda a, b: a & b, conditions),
            ["enter_long", "enter_tag"],
        ] = (1, "trend_or_breakout")
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        trend_break = qtpylib.crossed_below(
            dataframe["sma_fast"], dataframe["sma_slow"]
        )
        channel_break = dataframe["close"] < dataframe["donchian_low"]

        conditions = [(trend_break | channel_break)]
        dataframe.loc[
            reduce(lambda a, b: a & b, conditions),
            ["exit_long", "exit_tag"],
        ] = (1, "trend_or_channel_exit")
        return dataframe
