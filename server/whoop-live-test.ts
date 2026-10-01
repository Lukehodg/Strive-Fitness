// Standalone, loopback-only smoke test. Does not expose Vite, access the Strive
// database or relax production OAuth configuration. No credentials/data on disk.
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  providerClient,
  ProviderError,
  type Tokens,
  type WearableDay,
} from "./wearable-providers";

const clientId = process.env.WHOOP_CLIENT_ID;
const clientSecret = process.env.WHOOP_CLIENT_SECRET;
if (!clientId || !clientSecret)
  throw new Error(
    "Save WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET in .env first.",
  );
const origin = "http://localhost:8765";
const config = {
  authorize: "https://api.prod.whoop.com/oauth/oauth2/auth",
  token: "https://api.prod.whoop.com/oauth/oauth2/token",
  api: "https://api.prod.whoop.com/developer/v2",
  scopes: "offline read:profile read:recovery read:sleep",
  clientId,
  clientSecret,
  redirectUri: origin + "/callback",
};
const client = providerClient(fetch, (provider) =>
  provider === "whoop" ? config : null,
);
const launchKey = randomBytes(32).toString("hex");
const sessionKey = randomBytes(32).toString("hex");
const csrf = randomBytes(32).toString("hex");
let state: string | null = null;
let expires = 0;
let phase = "Ready to connect";
let tokens: Tokens | null = null;
let readings: WearableDay[] = [];
let busy = false;
let imported = false;
let refreshed = false;
let lastFailure: string | null = null;
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const form = (action: string, label: string) =>
  `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${csrf}"><button>${label}</button></form>`;
function page() {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${busy ? '<meta http-equiv="refresh" content="3;url=/">' : ""}<title>Strive · WHOOP live test</title><style>body{background:#0e1618;color:#eef5f2;font:17px system-ui;margin:0;padding:40px 20px}main{max-width:740px;margin:auto}h1{font-size:36px}p{color:#b2c4bf;line-height:1.6}.card{background:#192427;padding:24px;border-radius:20px;margin:20px 0}button{background:#bcead7;border:0;padding:14px 20px;border-radius:10px;color:#102721;font:600 16px system-ui;cursor:pointer}form{display:inline-block;margin:8px 8px 8px 0}table{width:100%;border-collapse:collapse}td,th{padding:12px 4px;text-align:left;border-bottom:1px solid #36504b}small{color:#b2c4bf}</style><main><small>STRIVE / LIVE PROVIDER CHECK</small><h1>Your WHOOP. Real data.</h1><p>This checks WHOOP sign-in and the same data adapter used by Strive. The iPhone app return flow is a separate test.</p><section class="card"><h2>${escape(phase)}</h2>${busy ? "<p>This page refreshes while the request completes.</p>" : tokens ? `${form("/sync", "Import latest readings")}${form("/refresh", "Test token refresh")}${form("/disconnect", "Disconnect WHOOP")}` : `<a style="color:#bcead7" href="/connect?csrf=${csrf}">Connect WHOOP</a>`}<p>${imported ? `Imported ${readings.length} scored days. ` : ""}${refreshed ? "Token refresh verified. " : ""}</p></section>${
    readings.length
      ? `<section class="card"><h2>Latest readings</h2><table><tr><th>Day</th><th>Recovery</th><th>Sleep</th><th>HRV</th></tr>${readings
          .slice()
          .sort((a, b) => b.day.localeCompare(a.day))
          .slice(0, 7)
          .map(
            (r) =>
              `<tr><td>${escape(r.day)}</td><td>${r.calibrating ? "Calibrating" : escape(r.score ?? "—")}</td><td>${r.sleepMinutes === null ? "—" : Math.round(r.sleepMinutes)} min</td><td>${r.hrv === null ? "—" : Math.round(r.hrv)} ms</td></tr>`,
          )
          .join("")}</table></section>`
      : ""
  }<p>Data and access tokens stay in this test process's memory. No Strive account is linked yet. This test ends after one hour; use Disconnect to revoke the grant when finished.</p></main></html>`;
}
async function sync() {
  const now = new Date();
  readings = await client.days(
    "whoop",
    tokens!.access_token,
    new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10),
    new Date(now.getTime() + 86400_000).toISOString().slice(0, 10),
    "Europe/London",
  );
  imported = true;
  phase = readings.length
    ? "WHOOP import succeeded"
    : "Connected · no scored readings in the last 30 days";
}
async function work(task: () => Promise<void>) {
  busy = true;
  lastFailure = null;
  try {
    await task();
  } catch (error) {
    lastFailure =
      error instanceof ProviderError ? error.kind : "unexpected_error";
    phase = `WHOOP request failed: ${lastFailure.replaceAll("_", " ")}. ${tokens ? "You can retry the import or disconnect." : "Please try connecting again."}`;
    console.log(`WHOOP live check: ${lastFailure}`);
  } finally {
    busy = false;
  }
}
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  const respond = (status: number, text: string) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
  };
  const redirect = (url: string) => {
    res.writeHead(303, { Location: url });
    res.end();
  };
  try {
    if (req.headers.host !== "localhost:8765")
      return respond(403, "Use the localhost test address.");
    const url = new URL(req.url!, origin);
    if (req.method === "GET" && url.pathname === "/health")
      return respond(
        200,
        JSON.stringify({
          busy,
          connected: !!tokens,
          imported,
          refreshed,
          error: lastFailure,
        }),
      );
    if (
      req.method === "GET" &&
      url.pathname === "/launch" &&
      equal(url.searchParams.get("key") || "", launchKey)
    ) {
      res.setHeader(
        "Set-Cookie",
        `strive_whoop_test=${sessionKey}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
      );
      return redirect("/");
    }
    const cookie =
      req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("strive_whoop_test="))
        ?.slice("strive_whoop_test=".length) || "";
    if (!equal(cookie, sessionKey))
      return respond(
        403,
        "Open the live-test launch link from Strive on this computer.",
      );
    if (req.method === "GET" && url.pathname === "/callback") {
      if (
        !state ||
        Date.now() > expires ||
        !equal(url.searchParams.get("state") || "", state) ||
        busy
      )
        return respond(
          400,
          "This sign-in has expired or was already used. Return to Strive and connect again.",
        );
      state = null;
      if (url.searchParams.has("error")) {
        phase = "WHOOP access was not granted";
        return redirect("/");
      }
      const code = url.searchParams.get("code");
      if (!code || code.length > 16000)
        return respond(400, "WHOOP did not return a valid authorization code.");
      phase = "Connecting and importing WHOOP…";
      void work(async () => {
        tokens = await client.exchange("whoop", code);
        await client.identity("whoop", tokens.access_token);
        await sync();
      });
      return redirect("/");
    }
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }
    if (
      req.method === "GET" &&
      url.pathname === "/connect" &&
      !tokens &&
      !busy &&
      equal(url.searchParams.get("csrf") || "", csrf)
    ) {
      state = randomBytes(32).toString("hex");
      expires = Date.now() + 10 * 60_000;
      const authorization = new URL(config.authorize);
      authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: config.scopes,
        state,
      }).toString();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>Continue to WHOOP</title><style>body{background:#0e1618;color:#eef5f2;font:20px system-ui;padding:48px}a{color:#bcead7}</style><h1>Continue to WHOOP</h1><p>Sign in and review permission to read your recovery, sleep and profile.</p><a href="${escape(authorization.toString())}">Open WHOOP sign-in</a></html>`,
      );
    }
    if (req.method !== "POST") return respond(404, "Not found.");
    if (req.headers.origin !== origin || busy)
      return respond(
        409,
        "Wait for the current request and use the test page.",
      );
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) return respond(413, "Request too large.");
    }
    if (!equal(new URLSearchParams(body).get("csrf") || "", csrf))
      return respond(403, "Invalid test request.");
    if (!tokens) return respond(409, "Connect WHOOP first.");
    if (url.pathname === "/sync") {
      phase = "Importing WHOOP…";
      void work(sync);
    } else if (url.pathname === "/refresh") {
      phase = "Refreshing WHOOP access…";
      void work(async () => {
        tokens = await client.refresh("whoop", tokens!.refresh_token);
        refreshed = true;
        await sync();
      });
    } else if (url.pathname === "/disconnect") {
      phase = "Disconnecting WHOOP…";
      void work(async () => {
        const revoked = await client.revoke("whoop", tokens!.access_token);
        tokens = null;
        readings = [];
        imported = false;
        phase = revoked
          ? "Disconnected from WHOOP"
          : "Cleared locally. Remove Strive access in WHOOP settings to finish revocation.";
      });
    } else return respond(404, "Not found.");
    redirect("/");
  } catch {
    respond(
      500,
      "The local test could not finish this request. No credentials were logged.",
    );
  }
});
server.listen(8765, "127.0.0.1", () =>
  console.log(`WHOOP live-test page: ${origin}/launch?key=${launchKey}`),
);
server.on("error", () => {
  console.error(
    "Could not start the local WHOOP test. Check whether port 8765 is already in use.",
  );
  process.exitCode = 1;
});
const stop = () => {
  tokens = null;
  readings = [];
  server.close();
};
setTimeout(stop, 3600_000).unref();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
