import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * How the market quotes an FX pair, for display only.
 *
 * The engine trades every pair turned to face USD, so USD/JPY is held
 * internally as JPY/USD (see server/trading/forex.ts for why). That is correct
 * arithmetically and confusing on screen: nobody's broker statement says
 * JPY/USD, so a position shown that way is hard to reconcile against the one
 * place it actually matters. Shown as "USD/JPY (short)" instead — which is
 * exactly what being long JPY/USD is.
 *
 * Kept as a small display map rather than an API field so the server's symbol
 * stays the single identity everywhere it is compared, keyed or stored.
 */
const FX_CONVENTIONAL: Record<string, string> = {
  "JPY/USD": "USD/JPY",
  "CHF/USD": "USD/CHF",
  "CAD/USD": "USD/CAD",
};

export function displaySymbol(symbol: string): string {
  const conventional = FX_CONVENTIONAL[symbol];
  return conventional ? `${conventional} ↓` : symbol;
}
