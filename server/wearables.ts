import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Express } from "express";
import { and, eq, gt, gte, isNull, lt, lte, or } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "./db";
import { asyncHandler } from "./auth";
import {
  users,
  wearableAuthorizations as attempts,
  wearableConnections as connections,
  wearableDays as days,
} from "../shared/schema";
import {
  configuration,
  providerClient,
  providerSchema,
  ProviderError,
  seal,
  unseal,
  type Provider,
  type ProviderFetch,
  type Tokens,
} from "./wearable-providers";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const context = (userId: number, provider: string) =>
  `wearable:${userId}:${provider}`;
const fail = (message: string, status = 409) =>
  Object.assign(new Error(message), { status });
const free = () =>
  or(isNull(connections.leaseUntil), lt(connections.leaseUntil, new Date()));
const leaseExpiry = () => new Date(Date.now() + 10 * 60_000);
const owned = (userId: number, provider: Provider) =>
  and(eq(connections.userId, userId), eq(connections.provider, provider));
const needConfig = (provider: Provider) => {
  const config = configuration(provider);
  if (!config)
    throw fail(
      "This provider needs server configuration before accounts can connect.",
      503,
    );
  return config;
};

export function registerWearableCallbacks(app: Express) {
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.get(
    "/api/integrations/:provider/callback",
    limiter,
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      const provider = providerSchema.parse(req.params.provider);
      needConfig(provider);
      const query = z
        .object({
          state: z.string().min(16).max(512),
          code: z.string().min(1).max(16000).optional(),
          error: z.string().max(200).optional(),
        })
        .parse(req.query);
      const attempt = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(attempts)
          .where(
            and(
              eq(attempts.stateHash, hash(query.state)),
              eq(attempts.provider, provider),
              gt(attempts.expiresAt, new Date()),
              isNull(attempts.callbackAt),
            ),
          )
          .for("update");
        if (!row)
          throw fail(
            "This sign-in link has expired or has already been used.",
            400,
          );
        await tx
          .update(attempts)
          .set({
            callbackAt: new Date(),
            code:
              query.code && !query.error
                ? seal(query.code, context(row.userId, provider))
                : null,
          })
          .where(eq(attempts.id, row.id));
        return row;
      });
      // No account credentials or claim secret in the deep link. An authenticated,
      // app-held claim is required before the server redeems the provider's code.
      res.redirect(
        303,
        `strivefitness://connections?attempt=${attempt.id}&status=${query.error ? "denied" : query.code ? "ready" : "failed"}`,
      );
    }),
  );
}

export function registerWearables(app: Express, fetcher?: ProviderFetch) {
  const client = providerClient(fetcher);
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use("/api/connections", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get(
    "/api/connections",
    asyncHandler(async (req, res) => {
      const rows = await db
        .select()
        .from(connections)
        .where(eq(connections.userId, req.account.id));
      const latest = await db
        .select()
        .from(days)
        .where(eq(days.userId, req.account.id));
      const result = Object.fromEntries(
        providerSchema.options.map((provider) => {
          const row = rows.find((r) => r.provider === provider);
          return [
            provider,
            {
              configured: !!configuration(provider),
              connected: row?.status === "connected",
              status: !configuration(provider)
                ? "not_configured"
                : row?.status || "disconnected",
              canDisconnect: !!row?.credentials || !!row?.subject,
              last_sync: row?.lastSyncAt || null,
              lastError: row?.lastError || null,
              syncing: !!row?.leaseUntil && row.leaseUntil > new Date(),
              queued: !!row?.nextSyncAt && row.nextSyncAt <= new Date(),
              latestDay:
                latest
                  .filter((v) => v.provider === provider)
                  .map((v) => v.day)
                  .sort()
                  .at(-1) || null,
            },
          ];
        }),
      );
      res.json({
        ...result,
        gmail: { connected: false, status: "not_configured" },
        outlook: { connected: false, status: "not_configured" },
      });
    }),
  );
  app.post(
    "/api/connections/:provider/authorize",
    limiter,
    asyncHandler(async (req, res) => {
      const provider = providerSchema.parse(req.params.provider);
      const config = needConfig(provider);
      const state = randomBytes(32).toString("hex");
      const claimToken = randomBytes(32).toString("hex");
      const verifier =
        provider === "oura" ? randomBytes(48).toString("base64url") : undefined;
      const attemptId = randomUUID();
      await db.transaction(async (tx) => {
        // Serialize authorization creation per account; a second start invalidates
        // the first, including a browser callback left open on another device.
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, req.account.id))
          .for("update");
        await tx
          .delete(attempts)
          .where(
            or(
              lt(attempts.expiresAt, new Date()),
              and(
                eq(attempts.userId, req.account.id),
                eq(attempts.provider, provider),
              ),
            ),
          );
        await tx
          .insert(attempts)
          .values({
            id: attemptId,
            userId: req.account.id,
            provider,
            stateHash: hash(state),
            claimHash: hash(claimToken),
            verifier: verifier
              ? seal(verifier, context(req.account.id, provider))
              : null,
            expiresAt: new Date(Date.now() + 10 * 60_000),
          });
      });
      const url = new URL(config.authorize);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: config.scopes,
        state,
        ...(verifier
          ? {
              code_challenge: createHash("sha256")
                .update(verifier)
                .digest("base64url"),
              code_challenge_method: "S256",
            }
          : {}),
      }).toString();
      res.json({ authorizationUrl: url.toString(), attemptId, claimToken });
    }),
  );
  app.post(
    "/api/connections/:provider/complete",
    limiter,
    asyncHandler(async (req, res) => {
      const provider = providerSchema.parse(req.params.provider);
      needConfig(provider);
      const input = z
        .object({
          attemptId: z.string().uuid(),
          claimToken: z.string().regex(/^[a-f\d]{64}$/),
        })
        .strict()
        .parse(req.body);
      const leaseId = randomUUID();
      const attempt = await db.transaction(async (tx) => {
        await tx
          .insert(connections)
          .values({ userId: req.account.id, provider })
          .onConflictDoNothing();
        const [claimed] = await tx
          .update(connections)
          .set({ leaseId, leaseUntil: leaseExpiry() })
          .where(and(owned(req.account.id, provider), free()))
          .returning();
        if (!claimed)
          throw fail(
            "A sync or connection change is in progress. Try again shortly.",
          );
        const [row] = await tx
          .delete(attempts)
          .where(
            and(
              eq(attempts.id, input.attemptId),
              eq(attempts.userId, req.account.id),
              eq(attempts.provider, provider),
              eq(attempts.claimHash, hash(input.claimToken)),
              gt(attempts.expiresAt, new Date()),
            ),
          )
          .returning();
        if (!row?.code || !row.callbackAt)
          throw fail("Sign-in is incomplete or expired. Connect again.", 400);
        return { ...row, previousSubject: claimed.subject };
      });
      const binding = context(req.account.id, provider);
      let tokens: Tokens | undefined;
      try {
        tokens = await client.exchange(
          provider,
          unseal(attempt.code!, binding),
          attempt.verifier ? unseal(attempt.verifier, binding) : undefined,
        );
        const subject = await client.identity(provider, tokens.access_token);
        if (attempt.previousSubject && attempt.previousSubject !== subject)
          throw fail(
            "Disconnect the existing account before linking a different account.",
          );
        const [saved] = await db
          .update(connections)
          .set({
            subject,
            credentials: seal(JSON.stringify(tokens), binding),
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            status: "connected",
            nextSyncAt: new Date(),
            failures: 0,
            lastError: null,
            leaseId: null,
            leaseUntil: null,
          })
          .where(
            and(
              owned(req.account.id, provider),
              eq(connections.leaseId, leaseId),
            ),
          )
          .returning({ id: connections.id });
        if (!saved) throw fail("The connection changed. Connect again.");
        res.json({ connected: true, queued: true });
      } catch (error) {
        if (tokens) await client.revoke(provider, tokens.access_token);
        if (tokens && attempt.previousSubject)
          await db
            .update(connections)
            .set({
              status: "reconnect_required",
              lastError: "reconnect_required",
              nextSyncAt: null,
            })
            .where(
              and(
                owned(req.account.id, provider),
                eq(connections.leaseId, leaseId),
              ),
            );
        if (error instanceof ProviderError)
          throw fail(
            "The provider could not complete sign-in. Please connect again.",
            502,
          );
        throw error;
      } finally {
        await db
          .update(connections)
          .set({ leaseId: null, leaseUntil: null })
          .where(
            and(
              owned(req.account.id, provider),
              eq(connections.leaseId, leaseId),
            ),
          );
      }
    }),
  );
  app.post(
    "/api/connections/:provider/sync",
    limiter,
    asyncHandler(async (req, res) => {
      const provider = providerSchema.parse(req.params.provider);
      needConfig(provider);
      const [row] = await db
        .select()
        .from(connections)
        .where(owned(req.account.id, provider));
      if (!row || row.status !== "connected")
        throw fail("Connect this account before syncing.");
      if (row.lastError && row.nextSyncAt && row.nextSyncAt > new Date())
        throw fail(
          "The provider is temporarily unavailable. Automatic retry is scheduled.",
          429,
        );
      if (row.lastSyncAt && row.lastSyncAt.getTime() > Date.now() - 60_000)
        return res.json({
          queued: false,
          message: "Already up to date. Try again in a minute.",
        });
      await db
        .update(connections)
        .set({ nextSyncAt: new Date() })
        .where(
          and(
            owned(req.account.id, provider),
            eq(connections.status, "connected"),
            free(),
          ),
        );
      res.status(202).json({ queued: true });
    }),
  );
  app.delete(
    "/api/connections/:provider",
    limiter,
    asyncHandler(async (req, res) => {
      const provider = providerSchema.parse(req.params.provider);
      const leaseId = randomUUID();
      const row = await db.transaction(async (tx) => {
        await tx
          .insert(connections)
          .values({ userId: req.account.id, provider })
          .onConflictDoNothing();
        const [claimed] = await tx
          .update(connections)
          .set({ leaseId, leaseUntil: leaseExpiry() })
          .where(and(owned(req.account.id, provider), free()))
          .returning();
        if (!claimed)
          throw fail(
            "Sync or sign-in is in progress. Try disconnecting shortly.",
          );
        return claimed;
      });
      let revoked = !row?.credentials;
      if (row?.credentials) {
        try {
          revoked = await client.revoke(
            provider,
            JSON.parse(
              unseal(row.credentials, context(req.account.id, provider)),
            ).access_token,
          );
        } catch {
          revoked = false;
        }
      }
      await db.transaction(async (tx) => {
        if (row) {
          const [removed] = await tx
            .delete(connections)
            .where(
              and(eq(connections.id, row.id), eq(connections.leaseId, leaseId)),
            )
            .returning();
          if (!removed)
            throw fail("The connection changed. Try disconnecting again.");
        }
        await tx
          .delete(days)
          .where(
            and(eq(days.userId, req.account.id), eq(days.provider, provider)),
          );
        await tx
          .delete(attempts)
          .where(
            and(
              eq(attempts.userId, req.account.id),
              eq(attempts.provider, provider),
            ),
          );
      });
      res.json({
        disconnected: true,
        revoked,
        message: revoked
          ? "Disconnected. Imported wearable readings removed."
          : "Disconnected locally. Remove Strive access in your provider's account settings to finish revocation.",
      });
    }),
  );
}

export async function syncWearables(fetcher?: ProviderFetch) {
  await db.delete(attempts).where(lt(attempts.expiresAt, new Date()));
  const client = providerClient(fetcher);
  const candidates = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.status, "connected"),
        lte(connections.nextSyncAt, new Date()),
        free(),
      ),
    )
    .limit(4);
  for (const candidate of candidates) {
    const provider = providerSchema.parse(candidate.provider);
    if (!configuration(provider)) continue;
    const leaseId = randomUUID();
    const [row] = await db
      .update(connections)
      .set({ leaseId, leaseUntil: leaseExpiry() })
      .where(
        and(
          eq(connections.id, candidate.id),
          eq(connections.status, "connected"),
          lte(connections.nextSyncAt, new Date()),
          free(),
        ),
      )
      .returning();
    if (!row) continue;
    const fenced = and(
      eq(connections.id, row.id),
      eq(connections.leaseId, leaseId),
    );
    try {
      const binding = context(row.userId, provider);
      let tokens: Tokens = JSON.parse(unseal(row.credentials!, binding));
      if (!row.expiresAt || row.expiresAt.getTime() <= Date.now() + 120_000) {
        tokens = await client.refresh(provider, tokens.refresh_token);
        // Persist rotated credentials before any other provider request. A failed
        // data download must never cause reuse of a consumed refresh token.
        const [saved] = await db
          .update(connections)
          .set({
            credentials: seal(JSON.stringify(tokens), binding),
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          })
          .where(fenced)
          .returning({ id: connections.id });
        if (!saved) continue;
      }
      const [user] = await db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, row.userId));
      if (!user) continue;
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const to = new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);
      // Fetch a boundary buffer because WHOOP sleep/recovery timestamps and the
      // user's local day need not share a UTC date.
      const fetchFrom = new Date(now.getTime() - 32 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const records = (
        await client.days(
          provider,
          tokens.access_token,
          fetchFrom,
          to,
          user.timezone,
        )
      ).filter((r) => r.day >= from);
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: connections.id })
          .from(connections)
          .where(fenced)
          .for("update");
        if (!current) return;
        await tx
          .delete(days)
          .where(
            and(
              eq(days.userId, row.userId),
              eq(days.provider, provider),
              gte(days.day, from),
              lte(days.day, to),
            ),
          );
        if (records.length)
          await tx
            .insert(days)
            .values(
              records.map((r) => ({ ...r, userId: row.userId, provider })),
            );
        await tx
          .update(connections)
          .set({
            lastSyncAt: now,
            nextSyncAt: new Date(Date.now() + 6 * 3600_000),
            lastError: null,
            failures: 0,
            leaseId: null,
            leaseUntil: null,
          })
          .where(fenced);
      });
    } catch (error) {
      const kind =
        error instanceof ProviderError ? error.kind : "invalid_response";
      const delay = Math.max(
        error instanceof ProviderError ? error.retryAfter * 1000 : 0,
        Math.min(6 * 3600_000, 60_000 * 2 ** Math.min(row.failures, 9)),
      );
      await db
        .update(connections)
        .set({
          status:
            kind === "reconnect_required" ? "reconnect_required" : "connected",
          lastError: kind,
          failures: row.failures + 1,
          nextSyncAt:
            kind === "reconnect_required" ? null : new Date(Date.now() + delay),
          leaseId: null,
          leaseUntil: null,
        })
        .where(fenced);
    }
  }
}

export function startWearableWorker() {
  let active: Promise<void> | undefined;
  const run = () => {
    if (!active)
      active = syncWearables()
        .catch(() => console.error("Wearable worker failed; retry scheduled."))
        .finally(() => {
          active = undefined;
        });
  };
  const timer = setInterval(run, 10_000);
  timer.unref();
  run();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
