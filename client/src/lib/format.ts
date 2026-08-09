// Small formatting helpers shared across every dashboard page.

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Countdown to a scheduled release. Negative means it has already happened. */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) return `${Math.abs(minutes)}m ago`;
  if (minutes < 60) return `in ${minutes}m`;
  if (minutes < 1440) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `in ${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

/**
 * Axis label with enough precision to actually distinguish the ticks.
 *
 * A flat `$${Math.round(v)}` rendered six identical "$10000" labels while an
 * account moved a dollar or two — the normal state early on — and told you
 * nothing. Precision now follows the plotted range.
 */
export function equityTick(v: number, span: number): string {
  const decimals = span >= 500 ? 0 : span >= 50 ? 1 : 2;
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
