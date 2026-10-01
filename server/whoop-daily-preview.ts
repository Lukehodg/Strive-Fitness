// Local companion. WHOOP data stays in the smoke test; training requests use
// the normal authenticated API. Never import/open the main database here.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { renderWhoopDaily, type DailyReading } from "./whoop-daily-page";

const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const nonce = randomBytes(24).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
  );
  if (
    req.headers.host !== "localhost:8766"
  ) {
    res.writeHead(404);
    return res.end("Not found.");
  }
  // Fixed destination and a narrow route list prevent this becoming an open proxy.
  const path = req.url || "";
  const allowed = (req.method === "GET" && /^\/api\/(auth\/me|exercises|users\/me\/workout-templates|training\/(records|sessions(?:\/\d+)?))$/.test(path)) ||
    (req.method === "POST" && /^\/api\/(auth\/(signup|signin|signout)|training\/(templates|templates\/\d+\/start|sessions\/\d+\/finish))$/.test(path)) ||
    (req.method === "PUT" && /^\/api\/training\/sessions\/\d+\/sets$/.test(path)) ||
    (req.method === "GET" && /^\/api\/(nutrition\/day(?:\?date=\d{4}-\d{2}-\d{2})?|users\/me\/medications|routine-logs|connections|readiness|check-in)$/.test(path)) ||
    (req.method === "POST" && /^\/api\/(nutrition\/entries|medications|routine-logs|check-in|connections\/(whoop|oura)\/sync)$/.test(path)) ||
    (req.method === "PUT" && /^\/api\/nutrition\/entries\/\d+$/.test(path)) ||
    (req.method === "PATCH" && /^\/api\/(user\/me|medications\/\d+)$/.test(path)) ||
    (req.method === "DELETE" && /^\/api\/connections\/(whoop|oura)$/.test(path)) ||
    (req.method === "GET" && /^\/api\/mail\/(connections|imports|outgoing|(gmail|outlook)\/recent)$/.test(path)) ||
    (req.method === "POST" && /^\/api\/mail\/(send|(gmail|outlook)\/import)$/.test(path)) ||
    (req.method === "PATCH" && /^\/api\/mail\/imports\/\d+$/.test(path));
  if (allowed) {
    res.setHeader("Content-Type", "application/json");
    if ((req.headers.origin && req.headers.origin !== "http://localhost:8766") || req.headers["sec-fetch-site"] === "cross-site" ||
      (req.method !== "GET" && (req.headers.origin !== "http://localhost:8766" || req.headers["x-strive-request"] !== "1"))) {
      res.writeHead(403); return res.end(JSON.stringify({message:"Invalid request origin."}));
    }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 256 * 1024) { res.writeHead(413); return res.end(JSON.stringify({message:"Request too large."})); } chunks.push(Buffer.from(chunk)); }
      const sessionCookie = req.headers.cookie?.split(";").map(v => v.trim()).find(v => /^strive_session=[a-f0-9]{64}$/.test(v));
      const upstream = await fetch("http://localhost:5000" + path, {method:req.method, redirect:"error", signal:AbortSignal.timeout(15000),
        headers:{"Content-Type":"application/json", "X-Strive-Request":"1", ...(sessionCookie ? {Cookie:sessionCookie} : {})},
        body: req.method === "GET" ? undefined : Buffer.concat(chunks)});
      for (const cookie of upstream.headers.getSetCookie()) res.setHeader("Set-Cookie", cookie);
      res.writeHead(upstream.status); return res.end(await upstream.text());
    } catch { res.writeHead(503); return res.end(JSON.stringify({message:"The local training server is unavailable. Start npm run dev and retry."})); }
  }
  if (req.method === "GET" && ["/workouts.js", "/lifestyle.js", "/dialog.js"].includes(path)) {
    res.writeHead(200, {"Content-Type":"text/javascript; charset=utf-8"});
    return res.end(await readFile(new URL(path === "/dialog.js" ? "./preview-dialog.js" : path === "/workouts.js" ? "./workout-preview-client.js" : "./lifestyle-preview-client.js", import.meta.url), "utf8"));
  }
  if (req.method !== "GET" || path !== "/") { res.writeHead(404); return res.end("Not found."); }
  const cookie = req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => /^strive_whoop_test=[a-f0-9]{64}$/.test(v));
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const render = (readings: DailyReading[]) => { res.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); res.end(renderWhoopDaily(readings, nonce, today)); };
  if (!cookie) return render([]);
  try {
    const response = await fetch("http://localhost:8765/", {
      headers: { Cookie: cookie },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      return render([]);
    const html = await response.text();
    // The companion consumes only the smoke test's rendered metric table. It
    // never reads the smoke-test process or its provider access/refresh tokens.
    const rows = [
      ...html.matchAll(
        /<tr><td>(\d{4}-\d{2}-\d{2})<\/td><td>([^<]*)<\/td><td>([^<]*) min<\/td><td>([^<]*) ms<\/td><\/tr>/g,
      ),
    ];
    const number = (value: string) =>
      /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
    const readings: DailyReading[] = rows.map((r) => ({
      day: r[1],
      recovery: number(r[2]),
      sleepMinutes: number(r[3]),
      hrv: number(r[4]),
    }));
    render(readings);
  } catch {
    render([]);
  }
});
server.listen(8766, "127.0.0.1", () =>
  console.log("Strive daily coaching preview: http://localhost:8766/"),
);
server.on("error", () => {
  console.error("Could not start Strive's local daily preview.");
  process.exitCode = 1;
});
setTimeout(() => server.close(), 3600_000).unref();
process.once("SIGINT", () => server.close());
process.once("SIGTERM", () => server.close());
