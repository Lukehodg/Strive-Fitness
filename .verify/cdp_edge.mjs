import WebSocket from "ws";
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl, { perMessageDeflate: false });
let id = 0; const pending = new Map(); const logs = [];
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evalp = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
ws.on("message", (d) => { const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description ?? "").slice(0,200));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") logs.push("error: " + m.params.args.map(a=>a.value).join(" ").slice(0,150));
});
await new Promise((r) => ws.on("open", r));
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1700, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "http://localhost:5000/" });
for (let i = 0; i < 45; i++) { await new Promise(r=>setTimeout(r,1000));
  if (await evalp(`document.querySelectorAll('[role="tab"]').length > 0`)) break; }
await new Promise(r=>setTimeout(r,2500));
console.log("PROOF-OF-EDGE PANEL:\n" + await evalp(`
  (() => { const el = [...document.querySelectorAll('*')].find(e => e.children.length===0 && e.textContent.trim()==='Proof of edge');
    return el ? el.closest('.term-panel').innerText : 'NOT FOUND'; })()`));
console.log("\nCONSOLE: " + (logs.length ? logs.join("\n") : "(none)"));
process.exit(0);
