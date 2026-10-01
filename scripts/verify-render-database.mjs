// Read-only recovery evidence. Does not print URLs, credentials or user records.
import postgres from 'postgres';
import { createHash } from 'node:crypto';
const client = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require', connect_timeout: 15 });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
  const connection = await client`select current_database() as database, ssl, version as tls_version
    from pg_stat_ssl where pid = pg_backend_pid()`;
  if (!connection[0]?.ssl) throw new Error('Database connection is not encrypted.');
  const migrations = await client`select hash, created_at from drizzle.__drizzle_migrations order by id`;
  const catalogue = await client`select * from exercises order by id`;
  const tables = await client`select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  console.log(JSON.stringify({ connection: connection[0], migrations: migrations.length,
    migrationDigest: digest(migrations), exercises: catalogue.length,
    catalogueDigest: digest(catalogue), tables: tables.length, tableDigest: digest(tables) }, null, 2));
} catch {
  console.error('Database verification failed. No credentials or query data were logged.');
  process.exitCode = 1;
} finally { await client.end({ timeout: 5 }); }
