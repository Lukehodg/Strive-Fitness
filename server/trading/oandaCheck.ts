// Does this .env actually authenticate against OANDA?
//
//   npm run check:oanda
//
// WHY THIS EXISTS. The startup banner in index.ts only proves the app FOUND
// something in OANDA_API_TOKEN / OANDA_ACCOUNT_ID — it prints "market data:
// OANDA" the moment those two env vars are non-empty, before any request has
// been made. A wrong token, a mismatched account id, or a practice token
// pointed at the live host all pass that check identically to a working one.
//
// Worse, a failed candle fetch is CAUGHT AND SWALLOWED in marketData.ts: on
// any error it falls back to the synthetic generator with no log line at all.
// So a broken connection and a healthy one look exactly the same in the
// console and in /api/status — which is the one failure mode this project has
// repeatedly treated as the most dangerous kind (see the SYNTHETIC DATA
// banner in index.ts, built for the identical problem with Alpaca).
//
// This makes ONE real, read-only call — GET /v3/accounts/:id/summary — and
// reports plainly whether it worked, at whatever host is configured.

// Load .env before reading credentials. Run via `tsx` directly rather than
// through index.ts (which loads this itself), .env is never read otherwise —
// process.env only has what the shell provided, so a real .env sitting right
// next to package.json is silently ignored and this reports "no credentials"
// even when they are there. That exact failure shipped in this file's first
// version and was only caught because a real run on a real machine, with real
// credentials in .env, still said "not found".
import "dotenv/config";

import { readOandaCredentials } from "./brokers";

const creds = readOandaCredentials();

if (!creds) {
  console.log("No OANDA credentials found.");
  console.log("");
  console.log("  Set these in .env, next to package.json:");
  console.log("    OANDA_API_TOKEN=<your v20 personal access token>");
  console.log("    OANDA_ACCOUNT_ID=<e.g. 001-004-1234567-001>");
  console.log("");
  console.log("  The app will run on synthetic prices until both are set.");
  process.exit(1);
}

const isLive = creds.baseUrl.includes("fxtrade");
console.log(`Checking OANDA connection…`);
console.log(`  endpoint:   ${creds.baseUrl}`);
console.log(`  account id: ${creds.accountId}`);
console.log(`  mode:       ${isLive ? "*** LIVE — real money ***" : "practice"}`);
console.log("");

try {
  const res = await fetch(`${creds.baseUrl}/v3/accounts/${creds.accountId}/summary`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  });

  if (res.ok) {
    const data: any = await res.json();
    const a = data?.account;
    console.log("CONNECTED — OANDA accepted the token and account id.");
    console.log("");
    if (a) {
      console.log(`  currency: ${a.currency ?? "?"}`);
      console.log(`  balance:  ${a.balance ?? "?"}`);
      console.log(`  NAV:      ${a.NAV ?? "?"}`);
      console.log(`  unrealizedPL: ${a.unrealizedPL ?? "?"}`);
    }
    console.log("");
    console.log("This confirms the credentials are real and live prices will flow.");
    process.exit(0);
  }

  const body = await res.text().catch(() => "");
  console.log(`FAILED — OANDA rejected the request (HTTP ${res.status}).`);
  console.log("");
  console.log(`  response: ${body.slice(0, 300)}`);
  console.log("");
  if (res.status === 401) {
    console.log("  401 usually means the token is wrong, expired, or was");
    console.log("  regenerated in the OANDA dashboard since you copied it.");
  } else if (res.status === 404) {
    console.log("  404 usually means the account id is wrong — check it in");
    console.log("  the OANDA dashboard. It looks like 001-004-1234567-001.");
  } else if (res.status === 403) {
    console.log("  403 often means the token and the account id belong to");
    console.log("  different environments — a PRACTICE token cannot see a");
    console.log("  LIVE account id, or vice versa.");
  }
  console.log("");
  console.log("  Until this passes, the app is silently running on synthetic");
  console.log("  prices even though .env looks configured — that is the exact");
  console.log("  failure this check exists to catch.");
  process.exit(1);
} catch (err) {
  console.log("FAILED — could not reach OANDA at all.");
  console.log("");
  console.log(`  ${(err as Error).message}`);
  console.log("");
  console.log("  This is a network problem, not a credentials problem: no");
  console.log("  internet, a firewall/proxy blocking the host, or a typo in");
  console.log("  OANDA_BASE_URL (it should have no trailing /v3).");
  process.exit(1);
}
