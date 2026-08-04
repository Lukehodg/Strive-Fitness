// Reproduces: does a portfolio-capped notional survive vol/Kelly sizing?
import { sizePosition } from "../server/trading/sizing";

const equity = 10_000, maxPositionPct = 0.25, price = 100;
// Portfolio logic decided this candidate may take at most $1,000.
const allowedNotional = 1_000;
const cappedStrength = allowedNotional / (equity * maxPositionPct); // 0.4

for (const [vol, kelly] of [[1, 1], [2, 1], [2, 1.5], [1.6, 1.25]] as const) {
  const r = sizePosition({
    equity, cash: equity, price, maxPositionPct,
    strength: cappedStrength, volMultiplier: vol, kellyMultiplier: kelly,
  });
  const notional = r.qty * price;
  console.log(
    `vol=${vol} kelly=${kelly}  ordered $${notional.toFixed(0)}  ` +
    `(portfolio allowed $${allowedNotional})  ${notional > allowedNotional + 1 ? "BREACH x" + (notional / allowedNotional).toFixed(2) : "ok"}`,
  );
}
console.log("\n--- with the portfolio ceiling passed as maxNotional ---");
for (const [vol, kelly] of [[1, 1], [2, 1], [2, 1.5], [1.6, 1.25]] as const) {
  const r = sizePosition({
    equity, cash: equity, price, maxPositionPct,
    strength: 1.0,                 // full conviction, as the engine now passes
    volMultiplier: vol, kellyMultiplier: kelly,
    maxNotional: allowedNotional,
  });
  const notional = r.qty * price;
  console.log(
    `vol=${vol} kelly=${kelly}  ordered $${notional.toFixed(0)}  ` +
    `${notional > allowedNotional + 1 ? "BREACH" : "respects ceiling"}`,
  );
}
process.exit(0);
