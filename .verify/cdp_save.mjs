// The exact sequence the user reported: Settings -> Everything -> Save.
// Captures the toast and any 4xx on /api/config.
import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const configCalls = [];
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evalp = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Network.responseReceived") {
    const { url, status } = m.params.response;
    if (url.includes("/api/config")) configCalls.push(status);
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

await click(`[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === "Settings")`);
await pause(1800);
console.log("apply Everything:", await click(btnContains("Everything")) ? "clicked" : "NOT FOUND");
await pause(2500);
console.log("symbols now:", await evalp(`fetch('/api/config').then(r=>r.json()).then(c=>String(1+(c.extraSymbols?.length??0)))`));

configCalls.length = 0;
console.log("press Save settings:", await click(btnContains("Save settings")) ? "clicked" : "NOT FOUND");
await pause(3000);

const toasts = await evalp(`
  [...document.querySelectorAll('[role="status"], li')]
    .map(e => e.innerText).filter(t => /save|couldn|error|too_big|extraSymbols/i.test(t)).join(' | ').slice(0,400)`);
console.log("\n/api/config statuses during save:", configCalls.join(", ") || "(none seen)");
console.log("save-related toast:", toasts || "(none — no error toast raised)");
console.log("any 4xx?", configCalls.some((s) => s >= 400) ? "YES — STILL BROKEN" : "no");

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/save-everything.png", Buffer.from(shot.data, "base64"));
process.exit(0);
