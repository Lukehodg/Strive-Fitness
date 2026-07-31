// Verify PaperBroker resting-order semantics: an order must NOT fill from the
// bar that produced its own reference price, and must settle correctly against
// the bar that elapses afterwards.

import { PaperBroker } from "./brokers";

const OFFSET = 0.0006;
let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  // 1. A maker buy rests; no cash moves, no position opens.
  {
    const b = new PaperBroker(1000);
    const o = await b.submitOrder(
      { symbol: "BTC/USD", side: "buy", qty: 0.01, limitOffsetPct: OFFSET }, 100,
    );
    const acct = await b.getAccount(100);
    check("maker buy returns pending", o.status === "pending", `status=${o.status}`);
    check("limit posted below market", Math.abs(o.price - 100 * (1 - OFFSET)) < 1e-9, `price=${o.price}`);
    check("no cash spent while resting", acct.cash === 1000, `cash=${acct.cash}`);
    check("no position while resting", (await b.getPosition("BTC/USD")) === null);
  }

  // 2. Resting buy fills as maker when the NEXT bar's low reaches the limit.
  {
    const b = new PaperBroker(1000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.01, limitOffsetPct: OFFSET }, 100);
    const limit = 100 * (1 - OFFSET);
    const [settled] = b.resolvePending({ "BTC/USD": { high: 101, low: limit - 0.5, close: 100 } });
    const pos = await b.getPosition("BTC/USD");
    check("touched resting buy fills", settled.status === "filled", `status=${settled.status}`);
    check("fills as maker", settled.fillType === "maker", `fillType=${settled.fillType}`);
    check("fills at the limit price", Math.abs(settled.price - limit) < 1e-9);
    check("position opened", pos !== null && Math.abs(pos.qty - 0.01) < 1e-12);
  }

  // 3. Untouched resting BUY is cancelled (entries have no urgency).
  {
    const b = new PaperBroker(1000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.01, limitOffsetPct: OFFSET }, 100);
    const [settled] = b.resolvePending({ "BTC/USD": { high: 101, low: 99.99, close: 100 } }); // never dips to limit
    check("untouched resting buy is cancelled", settled.status === "rejected", `status=${settled.status}`);
    check("no position after cancel", (await b.getPosition("BTC/USD")) === null);
  }

  // 4. Untouched resting SELL falls back to a taker fill — exits must happen.
  {
    const b = new PaperBroker(1000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.01 }, 100); // market entry
    const posBefore = await b.getPosition("BTC/USD");
    await b.submitOrder({ symbol: "BTC/USD", side: "sell", qty: 0.01, limitOffsetPct: OFFSET }, 100);
    const [settled] = b.resolvePending({ "BTC/USD": { high: 100.0, low: 99, close: 100 } }); // never reaches limit above
    check("entry via market order filled", posBefore !== null);
    check("untouched resting sell still fills", settled.status === "filled", `status=${settled.status}`);
    check("sell falls back to taker", settled.fillType === "taker", `fillType=${settled.fillType}`);
    check("position closed", (await b.getPosition("BTC/USD")) === null);
  }

  // 5. forceTaker (stop-loss) never rests — it must fill immediately.
  {
    const b = new PaperBroker(1000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.01 }, 100);
    const o = await b.submitOrder(
      { symbol: "BTC/USD", side: "sell", qty: 0.01, limitOffsetPct: OFFSET, forceTaker: true }, 100,
    );
    check("stop-loss fills immediately", o.status === "filled", `status=${o.status}`);
    check("stop-loss is a taker fill", o.fillType === "taker");
  }

  // 6. THE LOOKAHEAD TEST: the bar that produced the reference price must have
  //    no influence. Submitting against a bar that dipped far below the limit
  //    must still leave the order resting, not filled.
  {
    const b = new PaperBroker(1000);
    const o = await b.submitOrder(
      {
        symbol: "BTC/USD", side: "buy", qty: 0.01, limitOffsetPct: OFFSET,
        bar: { high: 200, low: 1 }, // decision bar swept way through the limit
      },
      100,
    );
    check("decision bar cannot fill the order", o.status === "pending", `status=${o.status}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures) process.exit(1);
}

main();
