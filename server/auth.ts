import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "node:crypto";
import { eq, and, gt, lt } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "./db";
import { users, sessions, type User } from "../shared/schema";
import { hashPassword, verifyPassword } from "./passwords";

declare global {
  namespace Express {
    interface Request {
      account: User;
    }
  }
}
const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-strive_session"
    : "strive_session";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const credentials = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});
const registration = credentials.extend({
  displayName: z.string().trim().min(2).max(80),
  timezone: z.string().max(80).default("UTC"),
});
export const publicUser = ({ password, ...user }: User) => user;
function tokenFrom(req: Request) {
  const authorization = req.get("Authorization");
  if (authorization) return /^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1];
  return req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
}
export const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
export async function loadAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = tokenFrom(req);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const [row] = await db
        .select({ account: users })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, digest(token)),
            gt(sessions.expiresAt, new Date()),
          ),
        );
      if (row) req.account = row.account;
    }
    next();
  } catch (error) {
    next(error);
  }
}
export function requireAccount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.account) return res.status(401).json({ message: "Please sign in." });
  next();
}
async function startSession(req: Request, res: Response, userId: number) {
  const old = tokenFrom(req);
  if (old) await db.delete(sessions).where(eq(sessions.tokenHash, digest(old)));
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400_000);
  await db
    .insert(sessions)
    .values({ tokenHash: digest(token), userId, expiresAt });
  if (req.get("X-Strive-Client") !== "native") {
    res.cookie(cookieName, token, { ...cookieOptions, expires: expiresAt });
  }
  return { token, expiresAt: expiresAt.toISOString() };
}
export function registerAuth(app: Express) {
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    // A cross-origin form cannot supply this header. The server does not grant CORS access.
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.get("X-Strive-Request") !== "1" ||
        req.get("Sec-Fetch-Site") === "cross-site")
    )
      return res.status(403).json({ message: "Invalid request origin." });
    next();
  });
  app.use("/api", loadAccount);
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again later." },
  });
  app.get("/api/auth/me", (req, res) =>
    req.account
      ? res.json(publicUser(req.account))
      : res.status(401).json({ message: "Please sign in." }),
  );
  app.post(
    "/api/auth/signup",
    limiter,
    asyncHandler(async (req, res) => {
      const data = registration.parse(req.body);
      const invited = process.env.BETA_ALLOWED_EMAILS?.split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      if (invited?.length && !invited.includes(data.email))
        return res.status(403).json({ message: "This private beta is invitation-only." });
      try {
        new Intl.DateTimeFormat("en", { timeZone: data.timezone });
      } catch {
        return res.status(400).json({ message: "Invalid timezone." });
      }
      const password = await hashPassword(data.password);
      const [user] = await db
        .insert(users)
        .values({
          username: data.email,
          displayName: data.displayName,
          password,
          timezone: data.timezone,
          dashboardWidgets: [],
        })
        .onConflictDoNothing()
        .returning();
      if (!user)
        return res
          .status(409)
          .json({ message: "Unable to create this account. Try signing in." });
      const session = await startSession(req, res, user.id);
      return res
        .status(201)
        .json(
          req.get("X-Strive-Client") === "native"
            ? { user: publicUser(user), ...session }
            : publicUser(user),
        );
    }),
  );
  const dummy = hashPassword(randomBytes(32).toString("hex"));
  app.post(
    "/api/auth/signin",
    limiter,
    asyncHandler(async (req, res) => {
      const data = credentials.parse(req.body);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, data.email));
      const valid = await verifyPassword(
        data.password,
        user?.password || (await dummy),
      );
      if (!user || !valid)
        return res.status(401).json({ message: "Invalid email or password." });
      const session = await startSession(req, res, user.id);
      return res.json(
        req.get("X-Strive-Client") === "native"
          ? { user: publicUser(user), ...session }
          : publicUser(user),
      );
    }),
  );
  app.post(
    "/api/auth/signout",
    asyncHandler(async (req, res) => {
      const token = tokenFrom(req);
      if (token)
        await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
      res.clearCookie(cookieName, cookieOptions);
      res.sendStatus(204);
    }),
  );
  app.use("/api", requireAccount);
}
