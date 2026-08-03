// Renders the scheduled-releases panel in both states: the live one (nothing
// blocked, calendar stale) and a stood-down one with symbols on hold. The
// blocked state is the one that explains why the bot went quiet, so it must
// not ship unrendered.
import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const STUB = process.argv.includes("--blocked");

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
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });

if (STUB) {
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const real = window.fetch;
    window.fetch = (u, o) => {
      if (String(u).includes('/api/events')) {
        return Promise.resolve(new Response(JSON.stringify({
          enabled: true, calendarStale: true, calendarValidThrough: 946684800000,
          blocked: [
            { symbol: 'XLE', reason: 'EIA weekly petroleum status in 18m — no new entries' },
            { symbol: 'XOM', reason: 'EIA weekly petroleum status in 18m — no new entries' },
          ],
          upcoming: [
            { kind:'eia_petroleum', title:'EIA weekly petroleum status', at: Date.now()+18*60000, minutesAway: 18, scope:'XLE, USO, XOM, CVX, COP, SLB, OXY', severity:'high', source:'rule' },
            { kind:'payrolls', title:'US nonfarm payrolls', at: Date.now()+5358*60000, minutesAway: 5358, scope:'all symbols', severity:'high', source:'rule' },
          ],
        }), { headers: { 'content-type': 'application/json' } }));
      }
      return real(u, o);
    };` });
}

await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}
await new Promise((r) => setTimeout(r, 2500));

console.log((STUB ? "BLOCKED STATE" : "LIVE STATE") + ":\n" + await evalp(`
  (() => {
    const el = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Scheduled releases');
    if (!el) return 'PANEL NOT FOUND';
    return el.closest('.term-panel').innerText;
  })()`));

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + (STUB ? "/events-blocked.png" : "/events-live.png"), Buffer.from(shot.data, "base64"));

if (!STUB) {
  // Settings: the blackout toggle and its two sliders.
  const box = await evalp(`
    (() => { const t = [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === "Settings");
      t.scrollIntoView({block:'center'});
      const r = t.getBoundingClientRect(); return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2}); })()`);
  const { x, y } = JSON.parse(box);
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  await new Promise((r) => setTimeout(r, 2500));
  console.log("\nSETTINGS:\n" + await evalp(`
    (() => {
      const el = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Event blackout');
      if (!el) return 'TOGGLE NOT FOUND';
      const row = el.closest('.term-inset');
      const sw = row.querySelector('[role="switch"]');
      el.scrollIntoView({block:'center'});
      const sliders = [...document.querySelectorAll('input[type=range]')].length;
      return row.innerText.slice(0,200) + '\\nswitch=' + sw.getAttribute('data-state') + '\\nrange inputs on page: ' + sliders;
    })()`));
  const s2 = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(SCRATCH + "/events-settings.png", Buffer.from(s2.data, "base64"));
}

console.log("\nCONSOLE:\n" + (logs.length ? logs.join("\n") : "(none)"));
process.exit(0);
