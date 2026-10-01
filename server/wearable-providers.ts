import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

export const providerSchema = z.enum(["whoop", "oura"]);
export type Provider = z.infer<typeof providerSchema>;
export type ProviderFetch = typeof fetch;
const endpoints = {
  whoop: {
    authorize: "https://api.prod.whoop.com/oauth/oauth2/auth",
    token: "https://api.prod.whoop.com/oauth/oauth2/token",
    api: "https://api.prod.whoop.com/developer/v2",
    scopes: "offline read:profile read:recovery read:sleep",
  },
  oura: {
    authorize: "https://cloud.ouraring.com/oauth/authorize",
    token: "https://api.ouraring.com/oauth/token",
    api: "https://api.ouraring.com/v2/usercollection",
    scopes: "personal daily",
  },
};
export function configuration(provider: Provider) {
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  const origin = process.env.PUBLIC_API_URL;
  if (
    !clientId ||
    !clientSecret ||
    !origin ||
    !/^[a-f\d]{64}$/i.test(process.env.INTEGRATION_ENCRYPTION_KEY || "")
  )
    return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    return null;
  return {
    ...endpoints[provider],
    clientId,
    clientSecret,
    redirectUri: `${url.origin}/api/integrations/${provider}/callback`,
  };
}
function key() {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY || "";
  if (!/^[a-f\d]{64}$/i.test(value))
    throw new Error("Integration encryption is not configured.");
  return Buffer.from(value, "hex");
}
export function seal(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}
export function unseal(value: string, context: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invalid encrypted credential.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
export class ProviderError extends Error {
  constructor(
    public kind:
      | "reconnect_required"
      | "rate_limited"
      | "provider_unavailable"
      | "invalid_response",
    public retryAfter = 0,
  ) {
    super(kind);
  }
}
const tokensSchema = z.object({
  access_token: z.string().min(1).max(16000),
  refresh_token: z.string().min(1).max(16000),
  expires_in: z.number().int().positive().max(31536000),
  token_type: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.literal("bearer")),
});
export type Tokens = z.infer<typeof tokensSchema>;
export type WearableDay = {
  day: string;
  sourceId: string;
  score: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  calibrating: boolean;
  observedAt: Date;
};
const score = z.number().min(0).max(100).nullable();
const metric = z.number().nonnegative().finite().nullable();
const day = z.string().date();
const dateTime = z.string().datetime({ offset: true });
const whoopRecovery = z.object({
  sleep_id: z.string(),
  score_state: z.string(),
  score: z
    .object({
      user_calibrating: z.boolean(),
      recovery_score: score,
      hrv_rmssd_milli: metric,
      resting_heart_rate: metric.optional(),
    })
    .nullish(),
});
const whoopSleep = z.object({
  id: z.string(),
  end: dateTime,
  nap: z.boolean(),
  score_state: z.string(),
  score: z
    .object({
      stage_summary: z.object({
        total_light_sleep_time_milli: metric,
        total_slow_wave_sleep_time_milli: metric,
        total_rem_sleep_time_milli: metric,
      }),
    })
    .nullish(),
});
const ouraReadiness = z.object({
  id: z.string(),
  day,
  score,
  timestamp: dateTime,
});
const ouraSleep = z.object({
  day,
  type: z.string().nullable(),
  bedtime_end: dateTime,
  total_sleep_duration: metric,
  average_hrv: metric,
});
const dayAt = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function providerClient(
  fetcher: ProviderFetch = fetch,
  getConfiguration: typeof configuration = configuration,
) {
  // Fixed hosts, no provider body/error/URL logging, bounded response and timeout.
  async function request(url: URL | string, options: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      throw new ProviderError("provider_unavailable");
    }
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry)
          : retry
            ? (Date.parse(retry) - Date.now()) / 1000
            : 0;
      void response.body?.cancel();
      throw new ProviderError(
        response.status === 401 ||
          response.status === 403 ||
          (response.status === 400 && String(url).includes("/token"))
          ? "reconnect_required"
          : response.status === 429
            ? "rate_limited"
            : "provider_unavailable",
        Math.min(86400, Math.max(0, seconds || 0)),
      );
    }
    if (response.status === 204) return null;
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError("invalid_response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw new ProviderError("invalid_response");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ProviderError("invalid_response");
    }
  }
  async function grant(
    provider: Provider,
    params: Record<string, string>,
  ): Promise<Tokens> {
    const config = getConfiguration(provider);
    if (!config) throw new ProviderError("provider_unavailable");
    const data = await request(config.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...params,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    const parsed = tokensSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError("invalid_response");
    return parsed.data;
  }
  async function api(provider: Provider, path: string, token: string) {
    return request(endpoints[provider].api + path, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  async function collection(
    provider: Provider,
    path: string,
    token: string,
    from: string,
    to: string,
  ) {
    const records: unknown[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const query =
        provider === "whoop"
          ? new URLSearchParams({
              start: from + "T00:00:00Z",
              end: to + "T23:59:59Z",
              limit: "25",
            })
          : new URLSearchParams({ start_date: from, end_date: to });
      if (cursor)
        query.set(provider === "whoop" ? "nextToken" : "next_token", cursor);
      const data = await api(provider, `${path}?${query}`, token);
      const result = z
        .object({
          records: z.array(z.unknown()).optional(),
          data: z.array(z.unknown()).optional(),
          next_token: z.string().max(10000).nullish(),
        })
        .safeParse(data);
      const items = result.success
        ? result.data[provider === "whoop" ? "records" : "data"]
        : undefined;
      if (!result.success || !items)
        throw new ProviderError("invalid_response");
      records.push(...items);
      cursor = result.data.next_token || undefined;
      if (!cursor) return records;
      if (seen.has(cursor)) throw new ProviderError("invalid_response");
      seen.add(cursor);
    }
    // Never replace saved history with an incomplete window.
    throw new ProviderError("invalid_response");
  }
  return {
    exchange: (provider: Provider, code: string, verifier?: string) =>
      grant(provider, {
        grant_type: "authorization_code",
        code,
        redirect_uri: getConfiguration(provider)!.redirectUri,
        ...(verifier ? { code_verifier: verifier } : {}),
      }),
    refresh: (provider: Provider, refreshToken: string) =>
      grant(provider, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        ...(provider === "whoop" ? { scope: "offline" } : {}),
      }),
    async identity(provider: Provider, token: string) {
      const value = await api(
        provider,
        provider === "whoop" ? "/user/profile/basic" : "/personal_info",
        token,
      );
      const parsed =
        provider === "whoop"
          ? z.object({ user_id: z.number().int().positive() }).safeParse(value)
          : z.object({ id: z.string().min(1) }).safeParse(value);
      if (!parsed.success) throw new ProviderError("invalid_response");
      return String(
        "user_id" in parsed.data ? parsed.data.user_id : parsed.data.id,
      );
    },
    async revoke(provider: Provider, token: string) {
      // Oura documents revocation with access_token in the query. Never log this URL.
      const url =
        provider === "whoop"
          ? endpoints.whoop.api + "/user/access"
          : `https://api.ouraring.com/oauth/revoke?${new URLSearchParams({ access_token: token })}`;
      try {
        const response = await fetcher(url, {
          method: provider === "whoop" ? "DELETE" : "GET",
          headers:
            provider === "whoop" ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        void response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
    async days(
      provider: Provider,
      token: string,
      from: string,
      to: string,
      timezone: string,
    ): Promise<WearableDay[]> {
      const result = new Map<string, WearableDay>();
      try {
        if (provider === "whoop") {
          const recoveries = z
            .array(whoopRecovery)
            .parse(await collection(provider, "/recovery", token, from, to));
          const sleeps = z
            .array(whoopSleep)
            .parse(
              await collection(provider, "/activity/sleep", token, from, to),
            );
          const sleepById = new Map(sleeps.map((v) => [v.id, v]));
          for (const recovery of recoveries) {
            const sleep = sleepById.get(recovery.sleep_id);
            if (
              !sleep ||
              sleep.nap ||
              sleep.score_state !== "SCORED" ||
              recovery.score_state !== "SCORED" ||
              !recovery.score
            )
              continue;
            const observedAt = new Date(sleep.end);
            const key = dayAt(observedAt, timezone);
            const stage = sleep.score?.stage_summary;
            const durations = stage
              ? [
                  stage.total_light_sleep_time_milli,
                  stage.total_slow_wave_sleep_time_milli,
                  stage.total_rem_sleep_time_milli,
                ]
              : [];
            const minutes =
              durations.length === 3 && durations.every((n) => n !== null)
                ? durations.reduce<number>((sum, n) => sum + (n || 0), 0) /
                  60000
                : null;
            const entry = {
              day: key,
              sourceId: sleep.id,
              score: recovery.score.recovery_score,
              sleepMinutes: minutes,
              hrv: recovery.score.hrv_rmssd_milli,
              restingHeartRate: recovery.score.resting_heart_rate ?? null,
              calibrating: recovery.score.user_calibrating,
              observedAt,
            };
            if (!result.has(key) || result.get(key)!.observedAt < observedAt)
              result.set(key, entry);
          }
        } else {
          const readiness = z
            .array(ouraReadiness)
            .parse(
              await collection(provider, "/daily_readiness", token, from, to),
            );
          const sleeps = z
            .array(ouraSleep)
            .parse(await collection(provider, "/sleep", token, from, to));
          for (const entry of readiness) {
            const sleep = sleeps
              .filter((s) => s.day === entry.day && s.type === "long_sleep")
              .sort(
                (a, b) =>
                  (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0),
              )[0];
            const observedAt = new Date(entry.timestamp);
            const value = {
              day: entry.day,
              sourceId: entry.id,
              score: entry.score,
              sleepMinutes:
                sleep?.total_sleep_duration == null
                  ? null
                  : sleep.total_sleep_duration / 60,
              hrv: sleep?.average_hrv ?? null,
              restingHeartRate: null,
              calibrating: false,
              observedAt,
            };
            if (
              !result.has(entry.day) ||
              result.get(entry.day)!.observedAt < observedAt
            )
              result.set(entry.day, value);
          }
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("invalid_response");
      }
      return [...result.values()].filter((v) => v.day >= from && v.day <= to);
    },
  };
}
