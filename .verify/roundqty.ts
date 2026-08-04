import { roundQtyFor } from "../server/trading/assets";
console.log("equity exits (must never truncate):");
for (const q of [2.7, 1.0, 0.4, 5.5]) {
  const r = roundQtyFor("AAPL", q, true, true);
  console.log(`  ${q} -> qty ${r.qty} limit=${r.canUseLimit} ${Math.abs(r.qty - q) > 1e-6 ? "TRUNCATED" : "full"}`);
}
console.log("equity entries (may round down to keep the maker fill):");
for (const q of [2.7, 0.4]) {
  const r = roundQtyFor("AAPL", q, true, false);
  console.log(`  ${q} -> qty ${r.qty} limit=${r.canUseLimit}`);
}
console.log("crypto unaffected:", JSON.stringify(roundQtyFor("BTC/USD", 0.12345678, true, true)));
process.exit(0);
