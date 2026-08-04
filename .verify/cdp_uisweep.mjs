// Drives every interactive control in the dashboard and reports what happened.
// Real mouse input (Radix ignores synthetic .click()), real network, real DOM.
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
    logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" ").slice(0, 200));
  if (m.method === "Runtime.exceptionThrown")
    logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === "Network.responseReceived") {
    const { url, status } = m.params.response;
    if (status >= 400 && url.includes("/api/")) failedReqs.push(`${status} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
  }
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break;
}
await new Promise((r) => setTimeout(r, 2500));

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Real mouse click at an element's centre, found by a JS expression. */
async function clickExpr(expr, label) {
  const box = await evalp(`
    (() => { const el = ${expr};
      if (!el) return null;
      el.scrollIntoView({block:'center'});
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2}); })()`);
  if (!box) { results.push([label, "NOT FOUND"]); return false; }
  const { x, y } = JSON.parse(box);
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  return true;
}

const results = [];
const byText = (tag, text) =>
  `[...document.querySelectorAll('${tag}')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
const btn = (text) => `[...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)})`;
const btnContains = (text) => `[...document.querySelectorAll('button')].find(e => e.textContent.includes(${JSON.stringify(text)}))`;

async function check(label, fn) {
  try { results.push([label, await fn()]); }
  catch (e) { results.push([label, "THREW: " + e.message]); }
}

// ---------------------------------------------------------------- tabs
const TABS = ["Activity", "Trades", "Strategies", "AI Lab", "Settings"];
for (const t of TABS) {
  await check(`tab: ${t}`, async () => {
    await clickExpr(`[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === ${JSON.stringify(t)})`, `tab ${t}`);
    await pause(1200);
    const sel = await evalp(`[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === ${JSON.stringify(t)})?.getAttribute('aria-selected')`);
    const panelText = await evalp(`document.querySelector('[role="tabpanel"][data-state="active"]')?.innerText?.slice(0,80) ?? ''`);
    return sel === "true" ? `selected, panel: ${JSON.stringify((panelText || "").split("\\n")[0])}` : `aria-selected=${sel}`;
  });
}

// ---------------------------------------------------------------- Settings controls
await clickExpr(`[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === "Settings")`, "settings");
await pause(1500);

await check("universe: apply 'Everything' (40 symbols)", async () => {
  const ok = await clickExpr(btnContains("Everything"), "everything");
  if (!ok) return "button NOT FOUND";
  await pause(2500);
  const cfg = await evalp(`fetch('/api/config').then(r=>r.json()).then(c=>String(1+(c.extraSymbols?.length??0)))`);
  return `${cfg} symbols configured`;
});

await check("SAVE SETTINGS after 'Everything' (the reported bug)", async () => {
  const ok = await clickExpr(btnContains("Save settings"), "save");
  if (!ok) return "button NOT FOUND";
  await pause(2500);
  const toastText = await evalp(`[...document.querySelectorAll('[role="status"], li')].map(e=>e.innerText).join(' | ').slice(0,200)`);
  return toastText || "(no toast captured)";
});

for (const [label, name] of [
  ["toggle: Confidence governor", "Confidence governor"],
  ["toggle: Event blackout", "Event blackout"],
  ["toggle: Maker-only entries", "Maker-only entries"],
  ["toggle: Portfolio volatility budget", "Portfolio volatility budget"],
  ["toggle: Adaptive sizing", "Adaptive sizing"],
]) {
  await check(label, async () => {
    const before = await evalp(`
      (() => { const p = ${byText("p", name)};
        return p ? p.closest('.term-inset')?.querySelector('[role="switch"]')?.getAttribute('data-state') : null; })()`);
    if (before === null) return "NOT FOUND";
    const ok = await clickExpr(`(() => { const p = ${byText("p", name)}; return p ? p.closest('.term-inset').querySelector('[role="switch"]') : null; })()`, name);
    if (!ok) return "switch not clickable";
    await pause(700);
    const after = await evalp(`
      (() => { const p = ${byText("p", name)};
        return p ? p.closest('.term-inset')?.querySelector('[role="switch"]')?.getAttribute('data-state') : null; })()`);
    // put it back
    await clickExpr(`(() => { const p = ${byText("p", name)}; return p ? p.closest('.term-inset').querySelector('[role="switch"]') : null; })()`, name);
    await pause(500);
    return before !== after ? `toggles ${before} -> ${after}` : `DID NOT TOGGLE (stuck ${before})`;
  });
}

await check("profile: apply 'Day trading'", async () => {
  const ok = await clickExpr(btnContains("Day trading"), "day profile");
  if (!ok) return "button NOT FOUND";
  await pause(2500);
  return await evalp(`fetch('/api/config').then(r=>r.json()).then(c=>'dayTradingMode='+c.dayTradingMode+' target='+(c.takeProfitPct*100).toFixed(1)+'% stop='+(c.stopLossPct*100).toFixed(1)+'%')`);
});

await check("profile: back to 'Swing'", async () => {
  const ok = await clickExpr(btnContains("Swing"), "swing profile");
  if (!ok) return "button NOT FOUND";
  await pause(2500);
  return await evalp(`fetch('/api/config').then(r=>r.json()).then(c=>'dayTradingMode='+c.dayTradingMode+' target='+(c.takeProfitPct*100).toFixed(1)+'%')`);
});

// ---------------------------------------------------------------- AI Lab
await clickExpr(`[...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === "AI Lab")`, "ai lab");
await pause(1500);
await check("AI Lab: Run analysis now", async () => {
  const ok = await clickExpr(btnContains("Run analysis"), "improve");
  if (!ok) return "button NOT FOUND";
  await pause(4000);
  return await evalp(`fetch('/api/improve/proposals').then(r=>r.json()).then(j=>'proposals='+j.proposals.length+' aiAvailable='+j.aiAvailable)`);
});
await check("AI Lab: Retrain model", async () => {
  const ok = await clickExpr(btnContains("Retrain"), "retrain");
  if (!ok) return "button NOT FOUND";
  await pause(5000);
  return await evalp(`fetch('/api/ml/status').then(r=>r.json()).then(j=>'acc='+(j.validationAccuracy*100).toFixed(1)+'% tradable='+j.tradable)`);
});

// ---------------------------------------------------------------- engine controls
await check("engine: Start", async () => {
  await clickExpr(btn("Start"), "start");
  await pause(2500);
  return await evalp(`fetch('/api/status').then(r=>r.json()).then(s=>'running='+s.running+' regime='+s.regime)`);
});
await check("engine: Stop", async () => {
  await clickExpr(btn("Stop"), "stop");
  await pause(2000);
  return await evalp(`fetch('/api/status').then(r=>r.json()).then(s=>'running='+s.running)`);
});

// ---------------------------------------------------------------- cash out
await check("cash out: first click shows confirmation (does NOT sell)", async () => {
  const ok = await clickExpr(btn("Cash out"), "cash out");
  if (!ok) return "button NOT FOUND";
  await pause(800);
  const confirm = await evalp(`!!${btnContains("Confirm — sell everything")}`);
  const cancel = await evalp(`!!${btnContains("Cancel")}`);
  return confirm && cancel ? "confirmation shown, nothing sold yet" : `confirm=${confirm} cancel=${cancel}`;
});
await check("cash out: Cancel backs out safely", async () => {
  await clickExpr(btnContains("Cancel"), "cancel");
  await pause(800);
  return (await evalp(`!!${btn("Cash out")}`)) ? "returned to idle" : "did not return to idle";
});

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(SCRATCH + "/ui-sweep.png", Buffer.from(shot.data, "base64"));

console.log("=== UI SWEEP ===");
for (const [label, r] of results) console.log(`  ${label.padEnd(48)} ${r}`);
console.log("\nFAILED /api REQUESTS: " + (failedReqs.length ? [...new Set(failedReqs)].join(", ") : "(none)"));
console.log("CONSOLE ERRORS: " + (logs.length ? logs.join("\n  ") : "(none)"));
process.exit(0);
