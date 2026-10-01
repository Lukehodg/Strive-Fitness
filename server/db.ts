import { PGlite } from "@electric-sql/pglite";
import { drizzle as localDrizzle } from "drizzle-orm/pglite";
import { migrate as localMigrate } from "drizzle-orm/pglite/migrator";
import { drizzle as remoteDrizzle } from "drizzle-orm/postgres-js";
import { migrate as remoteMigrate } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "../shared/schema";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
  throw new Error("Production requires DATABASE_URL.");
const remote = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 10 })
  : undefined;
const localPath = resolve(process.env.LOCAL_DATABASE_PATH || "./.data/strive");
if (!remote) mkdirSync(dirname(localPath), { recursive: true });
const local = remote ? undefined : new PGlite(localPath);
const localDb = local ? localDrizzle(local, { schema }) : undefined;
const remoteDb = remote ? remoteDrizzle(remote, { schema }) : undefined;
export const db: PgDatabase<PgQueryResultHKT, typeof schema> = (remoteDb ||
  localDb)!;
export async function migrateDatabase() {
  if (remoteDb)
    await remoteMigrate(remoteDb, { migrationsFolder: "./migrations" });
  else await localMigrate(localDb!, { migrationsFolder: "./migrations" });
}
export async function closeDatabase() {
  if (remote) await remote.end();
  if (local) await local.close();
}
