// Renders the confidence panel's "below the floor" branch by standing in for
// /api/confidence in the browser. The paused state is the one that matters most
// and the one hardest to reach live, so it must not be shipped unrendered.
import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const logs = [];
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evalp = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });

// Install the stand-in before the app boots, so the very first poll sees it.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  const real = window.fetch;
  window.fetch = (u, o) => {
    if (String(u).includes('/api/confidence')) {
      return Promise.resolve(new Response(JSON.stringify({
        available: true, enabled: true, score: 0.18, sizeMultiplier: 0.25, allowEntries: false,
        summary: 'Confidence 18% — below the 35% floor, holding off new entries.',
        factors: [
          { name: 'Sample size', score: 1, detail: '30 recent trades' },
          { name: 'Win rate', score: 0, detail: '20% of last 30' },
          { name: 'Drawdown', score: 0.15, detail: '8.5% below peak' },
          { name: 'Today', score: 0.2, detail: '-2.40% on the day' },
          { name: 'Regime fit', score: 0.6, detail: 'strategy is off-regime' },
        ],
      }), { headers: { 'content-type': 'application/json' } }));
    }
    return real(u, o);
  };` });

await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}
await new Promise((r) => setTimeout(r, 2000));

console.log("PAUSED PANEL:\n" + await evalp(`
  (() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Confidence governor');
    if (!el) return 'PANEL NOT FOUND';
    const card = el.closest('.term-panel');
    const score = card.querySelector('.text-2xl');
    const bar = card.querySelector('[style*="width"]');
    return card.innerText +
      '\\n--SCORE COLOUR--: ' + getComputedStyle(score).color +
      '\\n--BAR--: ' + bar.style.width + ' | ' + getComputedStyle(bar).backgroundColor +
      ' | ' + bar.getBoundingClientRect().width.toFixed(1) + 'px';
  })()`));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/conf-paused.png", Buffer.from(shot.data, "base64"));
console.log("\nCONSOLE:\n" + (logs.length ? logs.join("\n") : "(none)"));
process.exit(0);
