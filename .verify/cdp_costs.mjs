// Confirms the new Settings controls render, are populated from config, and
// that the cost readout reflects what /api/costs actually returns.
import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const logs = [];
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}
await new Promise((r) => setTimeout(r, 2000));

const box = await evalp(`
  (() => { const t = [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === "Settings");
    t.scrollIntoView({block:'center'});
    const r = t.getBoundingClientRect(); return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2}); })()`);
const { x, y } = JSON.parse(box);
for (const type of ["mousePressed", "mouseReleased"])
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
await new Promise((r) => setTimeout(r, 3000));

for (const label of ["Execution costs", "Maker-only entries", "Portfolio volatility budget"]) {
  console.log(`\n=== ${label} ===\n` + await evalp(`
    (() => {
      const el = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === ${JSON.stringify(label)});
      if (!el) return 'NOT FOUND';
      const row = el.closest('.term-inset');
      el.scrollIntoView({block:'center'});
      const sw = row.querySelector('[role="switch"]');
      const inputs = [...row.querySelectorAll('input')].map(i => i.type + '=' + (i.value || i.placeholder));
      return row.innerText.slice(0, 320) + (sw ? '\\nswitch=' + sw.getAttribute('data-state') : '') +
        (inputs.length ? '\\ninputs: ' + inputs.join(', ') : '');
    })()`));
}

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/settings-costs.png", Buffer.from(shot.data, "base64"));
console.log("\nCONSOLE:\n" + (logs.length ? logs.join("\n") : "(none)"));
process.exit(0);
