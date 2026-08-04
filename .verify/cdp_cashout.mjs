// Actually presses "Confirm — sell everything" with a real book open, and
// checks the account is flat afterwards. Also confirms the save toast.
import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const logs = []; const failedReqs = [];
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evalp = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 180));
  if (m.method === "Runtime.exceptionThrown")
    logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description ?? "").slice(0, 250));
  if (m.method === "Network.responseReceived") {
    const { url, status } = m.params.response;
    if (status >= 400 && url.includes("/api/")) failedReqs.push(`${status} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
  }
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await pause(2000);

const btnContains = (t) => `[...document.querySelectorAll('button')].find(e => e.textContent.includes(${JSON.stringify(t)}))`;
async function click(expr) {
  const box = await evalp(`
    (() => { const el = ${expr}; if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2}); })()`);
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  return true;
}

// Build a book: start the engine and let it fill.
console.log("start engine:", await click(btnContains("Start")) ? "clicked" : "NOT FOUND");
for (let i = 0; i < 24; i++) {
  await pause(5000);
  const n = await evalp(`fetch('/api/positions').then(r=>r.json()).then(p=>String(p.length))`);
  if (Number(n) > 0) { console.log(`positions open after ~${(i + 1) * 5}s: ${n}`); break; }
  if (i === 23) console.log("no positions opened in the window");
}

const before = await evalp(`fetch('/api/positions').then(r=>r.json()).then(p=>JSON.stringify({n:p.length, symbols:p.map(x=>x.symbol)}))`);
console.log("BEFORE cash out:", before);

// Cash out for real.
console.log("\nclick 'Cash out':", await click(btnContains("Cash out")) ? "ok" : "NOT FOUND");
await pause(900);
console.log("click 'Confirm — sell everything':", await click(btnContains("Confirm")) ? "ok" : "NOT FOUND");
await pause(6000);

const after = await evalp(`fetch('/api/positions').then(r=>r.json()).then(p=>JSON.stringify({n:p.length, symbols:p.map(x=>x.symbol)}))`);
const status = await evalp(`fetch('/api/status').then(r=>r.json()).then(s=>'running='+s.running)`);
const toast = await evalp(`[...document.querySelectorAll('[role="status"], li')].map(e=>e.innerText).join(' | ').slice(0,300)`);
console.log("AFTER cash out: ", after);
console.log("engine:         ", status);
console.log("toast:          ", toast || "(none captured)");

const trades = await evalp(`fetch('/api/trades').then(r=>r.json()).then(t=>'completed trades: '+t.length)`);
console.log(trades);

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/cashout.png", Buffer.from(shot.data, "base64"));
console.log("\nFAILED /api: " + (failedReqs.length ? [...new Set(failedReqs)].join(", ") : "(none)"));
console.log("CONSOLE: " + (logs.length ? logs.join("\n  ") : "(none)"));
process.exit(0);
