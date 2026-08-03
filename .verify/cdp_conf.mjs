import WebSocket from "ws";
import { writeFileSync } from "fs";
const SCRATCH = "/tmp/claude-0/-home-user-Strive-Fitness/486c3ea4-899c-5239-b3a5-4b21e0b7f59d/scratchpad";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalp = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" "));
  if (m.method === "Runtime.exceptionThrown")
    logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5000/" });
// Poll until React has actually mounted in the *current* execution context —
// evaluating too early silently targets the pre-navigation context and reports
// an empty page.
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}

console.log("URL:", await evalp(`location.href`));
console.log("root children:", await evalp(`document.getElementById('root')?.children.length`));
console.log("body has 'Confidence':", await evalp(`document.body.innerText.includes('Confidence')`));
console.log("tabs:", await evalp(`[...document.querySelectorAll('[role="tab"]')].map(t=>t.textContent.trim()).join(' | ')`));
console.log("api:", await evalp(`fetch('/api/confidence').then(r=>r.json()).then(j=>JSON.stringify({available:j.available,enabled:j.enabled,score:j.score}))`));

console.log("\nPANEL:\n" + await evalp(`
  (() => {
    const el = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === 'Confidence governor');
    if (!el.length) return 'PANEL LABEL NOT FOUND';
    return el.map(e => {
      const card = e.closest('.term-panel') || e.closest('.term-inset') || e.parentElement.parentElement;
      const bar = card.querySelector('[style*="width"]');
      return '<' + e.tagName + '> in ' + card.className.slice(0,40) + '\\n' + card.innerText +
        '\\n--BAR--: ' + (bar ? bar.style.width + ' | ' + getComputedStyle(bar).backgroundColor + ' | ' + bar.getBoundingClientRect().width.toFixed(1) + 'px wide, ' + bar.getBoundingClientRect().height.toFixed(1) + 'px tall' : 'NO BAR');
    }).join('\\n\\n=====\\n\\n');
  })()`));

const shot2 = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/conf-panel.png", Buffer.from(shot2.data, "base64"));

// Radix tabs ignore a synthetic .click(); they listen for real pointer input.
const box = await evalp(`
  (() => { const t = [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === "Settings");
    t.scrollIntoView({block:'center'});
    const r = t.getBoundingClientRect(); return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2}); })()`);
const { x, y } = JSON.parse(box);
for (const type of ["mousePressed", "mouseReleased"])
  await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
await new Promise((r) => setTimeout(r, 3000));
console.log("\ntab selected:", await evalp(`[...document.querySelectorAll('[role="tab"]')].map(t=>t.textContent.trim()+'='+t.getAttribute('aria-selected')).join(' ')`));
console.log("body mentions governor:", await evalp(`(document.body.innerText.match(/Confidence governor/gi)||[]).length`));
console.log("\nSETTINGS TOGGLE:\n" + await evalp(`
  (() => {
    const el = [...document.querySelectorAll('p')].find(p => p.textContent.trim() === 'Confidence governor');
    if (!el) return 'TOGGLE NOT FOUND; switches on page: ' + document.querySelectorAll('[role="switch"]').length;
    const row = el.closest('.term-inset');
    const sw = row.querySelector('[role="switch"]');
    el.scrollIntoView({block:'center'});
    return row.innerText.slice(0, 260) + '\\nswitch state=' + (sw ? sw.getAttribute('data-state') : 'NONE');
  })()`));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/settings-conf.png", Buffer.from(shot.data, "base64"));

console.log("\nCONSOLE ERRORS/WARNINGS:\n" + (logs.length ? logs.join("\n") : "(none)"));
process.exit(0);
