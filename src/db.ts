import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { databaseUrl, loadDigPaths } from "./runtime-paths.js";

const { Pool } = pg;

export type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

let pool: pg.Pool | null = null;

export function getDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string | null {
  return databaseUrl(environment);
}

export function createPool(connectionString = getDatabaseUrl() ?? undefined): pg.Pool | null {
  if (!connectionString) return null;
  return new Pool({ connectionString, max: 5 });
}

export function getPool(): pg.Pool | null {
  if (pool) return pool;
  pool = createPool() ?? null;
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const active = getPool();
  if (!active) throw new Error("Database is not configured (set DIG_DATABASE_URL or start compose db)");
  const client = await active.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function runMigrations(root = process.cwd(), client: Queryable = getPool()!): Promise<string[]> {
  if (!client) throw new Error("No database client for migrations");
  const paths = loadDigPaths(root);
  const migrationsDir = resolve(root, paths.database?.migrationsDir ?? "db/migrations");
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const applied = new Set(
    ((await client.query("SELECT id FROM schema_migrations")).rows as Array<{ id: string }>).map((row) => row.id)
  );
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return ran;
}
