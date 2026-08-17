/**
 * Wipe indexed library captures (Postgres + capture/index blobs) for a fresh start.
 * Keeps schema_migrations and dig_projects (Collection bindings).
 */
import { basename, resolve } from "node:path";
import { readdir, rm } from "node:fs/promises";
import type { Queryable } from "./db.js";
import { capturesDirectory, indexesDirectory, loadDigPaths } from "./runtime-paths.js";

export type LibraryResetResult = {
  captures_deleted: number;
  viewports_deleted: number;
  capture_dirs_removed: number;
  index_dirs_removed: number;
};

export function libraryResetConfig(root = process.cwd()): {
  confirm: string;
  path: string;
  doc: string;
} {
  const cfg = loadDigPaths(root).libraryReset;
  return {
    confirm: cfg?.confirm ?? "reset-library",
    path: cfg?.path ?? "/reset",
    doc: cfg?.doc ?? "knowledge/library-reset.md"
  };
}

export function assertSafeLibraryDataDir(dir: string, kind: "captures" | "indexes"): string {
  const resolved = resolve(dir);
  if (basename(resolved) !== kind) {
    throw new Error(`refusing to empty unexpected ${kind} directory: ${resolved}`);
  }
  return resolved;
}

export async function emptyLibraryDataDir(dir: string, kind: "captures" | "indexes"): Promise<number> {
  const resolved = assertSafeLibraryDataDir(dir, kind);
  let entries: Array<{ name: string }>;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return 0;
    throw error;
  }
  let removed = 0;
  for (const entry of entries) {
    await rm(resolve(resolved, String(entry.name)), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

async function countRows(client: Queryable, sql: string): Promise<number> {
  const result = await client.query(sql);
  const raw = result.rows[0]?.count;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function resetLibraryCatalog(
  client: Queryable,
  options: { capturesDir?: string; indexesDir?: string; root?: string } = {}
): Promise<LibraryResetResult> {
  const capturesDir = options.capturesDir ?? capturesDirectory(options.root);
  const indexesDir = options.indexesDir ?? indexesDirectory(options.root);

  const capturesDeleted = await countRows(client, "SELECT COUNT(*)::int AS count FROM captures");
  const viewportsDeleted = await countRows(client, "SELECT COUNT(*)::int AS count FROM viewports");

  await client.query(
    `TRUNCATE TABLE captures, collections, llm_stage_cache, dig_flows RESTART IDENTITY CASCADE`
  );
  await client.query(
    `UPDATE dig_projects SET capture_count = 0, reference_count = 0, updated_at = NOW()`
  );

  const captureDirsRemoved = await emptyLibraryDataDir(capturesDir, "captures");
  const indexDirsRemoved = await emptyLibraryDataDir(indexesDir, "indexes");

  return {
    captures_deleted: capturesDeleted,
    viewports_deleted: viewportsDeleted,
    capture_dirs_removed: captureDirsRemoved,
    index_dirs_removed: indexDirsRemoved
  };
}
