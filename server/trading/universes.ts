// Ready-made trading universes.
//
// A large universe does NOT mean a large book. The engine scans everything
// here each tick but the portfolio limits in portfolio.ts still decide what it
// may actually hold (3 concurrent positions and 60% total exposure by
// default). So a wide universe buys SELECTION — more candidates to pick the
// best from — not more risk.

export interface UniversePreset {
  id: string;
  name: string;
  description: string;
  symbols: string[];
}

/** Alpaca's liquid USD crypto pairs. Trade 24/7, no day-trading restrictions. */
const CRYPTO: string[] = [
  "BTC/USD", "ETH/USD", "LTC/USD", "BCH/USD", "LINK/USD",
  "UNI/USD", "AAVE/USD", "AVAX/USD", "DOT/USD", "SOL/USD",
  "SHIB/USD", "DOGE/USD", "XRP/USD", "MKR/USD", "SUSHI/USD",
];

/** Large-cap US equities: tight spreads, deep liquidity, reliable data. */
const MEGA_CAP: string[] = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN",
  "META", "TSLA", "AVGO", "JPM", "V",
  "UNH", "XOM", "JNJ", "WMT", "MA",
];

/** Liquid sector and index ETFs — broad exposure, very tight spreads. */
const ETFS: string[] = [
  "SPY", "QQQ", "IWM", "DIA", "XLF",
  "XLE", "XLK", "XLV", "GLD", "TLT",
];

export const UNIVERSE_PRESETS: UniversePreset[] = [
  {
    id: "crypto",
    name: "Crypto only",
    description:
      "15 liquid USD pairs. Trades 24/7 and is exempt from the Pattern Day " +
      "Trader rule, so it is the only preset viable on a small real-money account.",
    symbols: CRYPTO,
  },
  {
    id: "stocks",
    name: "US large caps",
    description:
      "15 mega-cap equities. Market hours only. PDT applies under $25k.",
    symbols: MEGA_CAP,
  },
  {
    id: "etfs",
    name: "Index & sector ETFs",
    description:
      "10 liquid ETFs. Tighter spreads than single stocks and less headline risk.",
    symbols: ETFS,
  },
  {
    id: "everything",
    name: "Everything",
    description:
      "All 40 symbols across crypto, equities and ETFs. Widest selection; the " +
      "portfolio limits still cap what is actually held. Crypto keeps trading " +
      "overnight while the equities stand down.",
    symbols: [...CRYPTO, ...MEGA_CAP, ...ETFS],
  },
];

export function getPreset(id: string): UniversePreset | undefined {
  return UNIVERSE_PRESETS.find((p) => p.id === id);
}
