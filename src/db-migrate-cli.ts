#!/usr/bin/env node
import { closePool, getPool, runMigrations } from "./db.js";
import { loadDotEnv } from "./load-env.js";

loadDotEnv();

const pool = getPool();
if (!pool) {
  console.error("No database URL configured. Set DIG_DATABASE_URL or start compose db.");
  process.exit(1);
}

try {
  const ran = await runMigrations();
  console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Migrations already up to date");
} finally {
  await closePool();
}
