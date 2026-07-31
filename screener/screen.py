"""Fundamental stock screener (FinanceToolkit).

WHY THIS EXISTS, AND WHAT IT DELIBERATELY DOES NOT DO
-----------------------------------------------------
The trading engine applies technical indicators to minute bars. That is fine
for crypto, but for equities it throws away the information that is actually
specific to a company: earnings, margins, leverage, valuation.

This screener supplies that missing half. It answers "WHICH stocks are worth
trading at all?" — not "when should I buy?". Fundamentals update quarterly,
while the engine turns over ~450 round trips a month, so over that horizon a
P/E ratio is a constant and cannot generate an entry signal. Treating it as
one would be a category error. So the output is a ranked universe, and the
engine keeps making its own timing decisions.

Honesty note: a quality/value screen is a reasonable prior, not a measured
edge. Nothing here has been shown to improve this bot's returns.

Usage:
    python screener/screen.py                       # default universe
    python screener/screen.py --tickers AAPL MSFT NVDA
    python screener/screen.py --top 10

Writes data/screen.json, which the app reads via /api/screen.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Each metric: (FinanceToolkit Ratios method, direction, human label).
# direction=+1 -> higher is better, -1 -> lower is better.
METRICS: list[tuple[str, int, str]] = [
    ("get_return_on_equity", +1, "Return on equity"),
    ("get_net_profit_margin", +1, "Net profit margin"),
    ("get_current_ratio", +1, "Current ratio"),
    ("get_price_to_earnings_ratio", -1, "P/E"),
    ("get_price_to_book_ratio", -1, "P/B"),
    ("get_debt_to_equity_ratio", -1, "Debt / equity"),
]

DEFAULT_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
    "META", "JPM", "V", "UNH", "XOM",
    "JNJ", "PG", "HD", "MA", "COST",
]


def zscore(values: dict[str, float]) -> dict[str, float]:
    """Cross-sectional z-scores. Returns 0.0 for everything when the metric
    cannot discriminate (fewer than two names, or zero variance)."""
    clean = {k: v for k, v in values.items() if v is not None and math.isfinite(v)}
    if len(clean) < 2:
        return {k: 0.0 for k in clean}
    mean = sum(clean.values()) / len(clean)
    var = sum((v - mean) ** 2 for v in clean.values()) / (len(clean) - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return {k: 0.0 for k in clean}
    return {k: (v - mean) / sd for k, v in clean.items()}


def composite_scores(
    metric_values: dict[str, dict[str, float]],
) -> dict[str, dict]:
    """Combine per-metric readings into one transparent score per ticker.

    `metric_values` maps metric key -> {ticker: value}. Each metric is
    z-scored across the universe, flipped so that higher always means better,
    and averaged over whichever metrics that ticker actually has. Averaging
    (rather than summing) stops a company with missing data from being
    penalised simply for having fewer readings.
    """
    directions = {key: direction for key, direction, _ in METRICS}
    contributions: dict[str, dict[str, float]] = {}

    for key, values in metric_values.items():
        z = zscore(values)
        for ticker, score in z.items():
            contributions.setdefault(ticker, {})[key] = score * directions[key]

    out: dict[str, dict] = {}
    for ticker, parts in contributions.items():
        if not parts:
            continue
        out[ticker] = {
            "score": sum(parts.values()) / len(parts),
            "contributions": parts,
            "metrics": {
                key: metric_values[key].get(ticker) for key in parts
            },
        }
    return out


def latest_value(frame, ticker: str):
    """Most recent non-NaN reading for `ticker` from a FinanceToolkit frame.

    The library returns tickers on one axis and periods on the other, and
    which is which varies by call shape, so probe both rather than assume.
    """
    try:
        import pandas as pd  # noqa: F401
    except ImportError:  # pragma: no cover
        return None

    series = None
    try:
        if hasattr(frame, "loc") and ticker in getattr(frame, "index", []):
            series = frame.loc[ticker]
        elif hasattr(frame, "columns") and ticker in getattr(frame, "columns", []):
            series = frame[ticker]
        elif hasattr(frame, "index"):
            # Single-ticker calls collapse to a plain period-indexed series.
            series = frame
    except Exception:
        return None
    if series is None:
        return None

    try:
        cleaned = series.dropna()
        if len(cleaned) == 0:
            return None
        value = cleaned.iloc[-1]
        value = float(value)
        return value if math.isfinite(value) else None
    except Exception:
        return None


def fetch(tickers: list[str], api_key: str | None, quarterly: bool) -> tuple[dict, str]:
    from financetoolkit import Toolkit

    toolkit = Toolkit(
        tickers=tickers,
        api_key=api_key or "",
        quarterly=quarterly,
    )
    source = "FinancialModelingPrep" if api_key else "Yahoo Finance (no FMP_API_KEY set)"

    metric_values: dict[str, dict[str, float]] = {}
    for method_name, _direction, label in METRICS:
        try:
            frame = getattr(toolkit.ratios, method_name)()
        except Exception as exc:  # a single unavailable ratio must not kill the run
            print(f"  ! {label}: unavailable ({type(exc).__name__})", file=sys.stderr)
            continue
        values = {t: latest_value(frame, t) for t in tickers}
        values = {t: v for t, v in values.items() if v is not None}
        if values:
            metric_values[method_name] = values
        print(f"  - {label}: {len(values)}/{len(tickers)} tickers", file=sys.stderr)

    return metric_values, source


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank stocks on fundamentals.")
    parser.add_argument("--tickers", nargs="*", default=None)
    parser.add_argument("--top", type=int, default=0, help="Keep only the top N.")
    parser.add_argument("--quarterly", action="store_true", help="Use quarterly statements.")
    parser.add_argument("--out", default="data/screen.json")
    args = parser.parse_args()

    tickers = [t.upper() for t in (args.tickers or DEFAULT_UNIVERSE)]
    api_key = os.environ.get("FMP_API_KEY") or None

    if not api_key:
        print(
            "No FMP_API_KEY set — falling back to Yahoo Finance. Fundamentals\n"
            "coverage is thinner there. Get a free key at financialmodelingprep.com\n"
            "(250 requests/day, 5 years history, US-listed only).",
            file=sys.stderr,
        )

    print(f"Screening {len(tickers)} tickers...", file=sys.stderr)
    metric_values, source = fetch(tickers, api_key, args.quarterly)

    if not metric_values:
        print("No fundamental data retrieved — nothing written.", file=sys.stderr)
        return 1

    scored = composite_scores(metric_values)
    labels = {key: label for key, _d, label in METRICS}
    ranked = sorted(scored.items(), key=lambda kv: kv[1]["score"], reverse=True)
    if args.top > 0:
        ranked = ranked[: args.top]

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "universe": tickers,
        "metricLabels": {k: labels[k] for k in labels},
        "ranked": [
            {
                "rank": i + 1,
                "symbol": ticker,
                "score": round(data["score"], 4),
                "metrics": {
                    labels[k]: (round(v, 4) if v is not None else None)
                    for k, v in data["metrics"].items()
                },
            }
            for i, (ticker, data) in enumerate(ranked)
        ],
        "note": (
            "Ranks WHICH stocks look fundamentally sound. It does not time "
            "entries — fundamentals move quarterly, the engine trades minute "
            "bars. A quality/value tilt is a reasonable prior, not a measured "
            "edge for this bot."
        ),
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2))

    print(f"\nWrote {out_path} ({len(payload['ranked'])} ranked)\n", file=sys.stderr)
    for row in payload["ranked"]:
        print(f"  {row['rank']:>2}. {row['symbol']:<6} score {row['score']:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
