"""Kronos forecasting sidecar.

Kronos (https://github.com/shiyu-coder/Kronos) is a Python/PyTorch
foundation model for financial candlesticks. It has no relationship to
Node.js, so it cannot live in-process with the rest of this app the way
every other strategy does — it runs as a small standalone HTTP service
that the Node app calls over localhost, the same shape as the existing
optional `screener/screen.py`.

WHAT THIS IS NOT: a validated trading signal. It is a pretrained model
whose public demo forecasts BTC/USDT — nothing here claims it has ever
been shown to forecast spot FX usefully. Like every other strategy in
this project, kronos_forecast only reaches live money through the same
requireProvenEdge gate (30+ trades, real positive expectancy) — this
server does not, and should not, special-case that.

Run:
    KRONOS_STUB=1 python kronos_sidecar/server.py     # no model weights needed, for testing the contract
    python kronos_sidecar/server.py                    # real model, downloads weights from Hugging Face Hub

Endpoints:
    GET  /health   -> {"status": "ok", "modelSize": ..., "device": ..., "stub": bool}
    POST /predict  -> body: {candles: [{time, open, high, low, close, volume?}, ...],
                              intervalMinutes: number, predLen: number,
                              sampleCount?: number, temperature?: number, topP?: number}
                       response: {forecast: [{time, open, high, low, close, volume}, ...]}
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# The submodule is not a pip package (see vendor/kronos/README.md — "must be
# cloned locally, no pip package"), so its `model` package is only importable
# once its own directory is on sys.path.
_VENDOR_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vendor", "kronos")
sys.path.insert(0, os.path.abspath(_VENDOR_DIR))

STUB = os.environ.get("KRONOS_STUB", "0") == "1"
MODEL_SIZE = os.environ.get("KRONOS_MODEL_SIZE", "small")
PORT = int(os.environ.get("KRONOS_PORT", "8787"))

# model size -> (model repo, tokenizer repo, max_context). See vendor/kronos/README.md's
# pairing table — a tokenizer trained for a different context length silently
# produces garbage, so this pairing is not a free choice.
MODEL_REGISTRY = {
    "mini": ("NeoQuasar/Kronos-mini", "NeoQuasar/Kronos-Tokenizer-2k", 2048),
    "small": ("NeoQuasar/Kronos-small", "NeoQuasar/Kronos-Tokenizer-base", 512),
    "base": ("NeoQuasar/Kronos-base", "NeoQuasar/Kronos-Tokenizer-base", 512),
}


class StubPredictor:
    """Deterministic, clearly-fake predictor used when KRONOS_STUB=1.

    Exists so the Node<->Python HTTP contract, error handling, and strategy
    wiring can be tested without a Hugging Face download or a GPU. It is a
    flat continuation of the last close with a small alternating wobble —
    intentionally NOT a real forecast, just enough structure to prove the
    plumbing carries real numbers end to end.
    """

    def predict(self, df, x_timestamp, y_timestamp, pred_len, **kwargs):
        import pandas as pd

        last = df.iloc[-1]
        rows = []
        for i in range(pred_len):
            wobble = 1 + (0.0005 if i % 2 == 0 else -0.0005)
            close = float(last["close"]) * (wobble ** (i + 1))
            rows.append(
                {
                    "open": close,
                    "high": close * 1.0005,
                    "low": close * 0.9995,
                    "close": close,
                    "volume": float(last.get("volume", 0.0)),
                    "amount": 0.0,
                }
            )
        return pd.DataFrame(rows, index=y_timestamp)


def load_predictor():
    if STUB:
        print("KRONOS_STUB=1 — using StubPredictor, no real model loaded.")
        return StubPredictor(), "stub", "cpu"

    if MODEL_SIZE not in MODEL_REGISTRY:
        raise SystemExit(
            f"Unknown KRONOS_MODEL_SIZE '{MODEL_SIZE}'. Choose one of: {', '.join(MODEL_REGISTRY)}"
        )
    model_repo, tokenizer_repo, max_context = MODEL_REGISTRY[MODEL_SIZE]

    from model import Kronos, KronosPredictor, KronosTokenizer  # noqa: E402  (path set above)

    print(f"Loading {tokenizer_repo} / {model_repo} from Hugging Face Hub (first run downloads weights)...")
    tokenizer = KronosTokenizer.from_pretrained(tokenizer_repo)
    model = Kronos.from_pretrained(model_repo)
    predictor = KronosPredictor(model, tokenizer, max_context=max_context)
    print(f"Kronos ready — model={MODEL_SIZE} device={predictor.device}")
    return predictor, MODEL_SIZE, predictor.device


PREDICTOR, LOADED_MODEL_SIZE, DEVICE = load_predictor()


def build_future_timestamps(last_time: datetime, interval_minutes: float, pred_len: int):
    return [last_time + timedelta(minutes=interval_minutes * (i + 1)) for i in range(pred_len)]


def run_prediction(body: dict) -> dict:
    import pandas as pd

    candles = body.get("candles")
    pred_len = int(body.get("predLen", 12))
    interval_minutes = float(body.get("intervalMinutes", 60))
    sample_count = int(body.get("sampleCount", 1))
    temperature = float(body.get("temperature", 1.0))
    top_p = float(body.get("topP", 0.9))

    if not candles or not isinstance(candles, list):
        raise ValueError("candles must be a non-empty array")
    if pred_len < 1:
        raise ValueError("predLen must be >= 1")

    df = pd.DataFrame(candles)
    for col in ("open", "high", "low", "close"):
        if col not in df.columns:
            raise ValueError(f"candles missing required field '{col}'")
    if "volume" not in df.columns:
        df["volume"] = 0.0

    x_timestamp = pd.to_datetime(df["time"])
    df = df[["open", "high", "low", "close", "volume"]].astype(float)

    last_time = x_timestamp.iloc[-1].to_pydatetime()
    if last_time.tzinfo is None:
        last_time = last_time.replace(tzinfo=timezone.utc)
    future_times = build_future_timestamps(last_time, interval_minutes, pred_len)
    y_timestamp = pd.to_datetime(pd.Series([t.isoformat() for t in future_times]))

    pred_df = PREDICTOR.predict(
        df=df,
        x_timestamp=x_timestamp,
        y_timestamp=y_timestamp,
        pred_len=pred_len,
        T=temperature,
        top_p=top_p,
        sample_count=sample_count,
        verbose=False,
    )

    forecast = []
    for ts, row in pred_df.iterrows():
        forecast.append(
            {
                "time": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0.0)),
            }
        )
    return {"forecast": forecast}


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(
                200,
                {"status": "ok", "modelSize": LOADED_MODEL_SIZE, "device": str(DEVICE), "stub": STUB},
            )
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/predict":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            body = json.loads(raw) if raw else {}
            result = run_prediction(body)
            self._send_json(200, result)
        except ValueError as e:
            self._send_json(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001 — a bad request should never crash the sidecar
            self._send_json(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Kronos sidecar listening on http://127.0.0.1:{PORT} (stub={STUB}, model={LOADED_MODEL_SIZE})")
    server.serve_forever()
