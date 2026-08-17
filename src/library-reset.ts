/**
 * Wipe indexed library captures (Postgres + capture/index blobs) for a fresh start.
 * Keeps schema_migrations and dig_projects (Collection bindings).
 */
import { basename, resolve } from "node:path";
import { readdir, rm } from "node:fs/promises";
import { captureIdentityKey } from "./capture-identity.js";
import type { Queryable } from "./db.js";
import { capturesDirectory, indexesDirectory, loadDigPaths } from "./runtime-paths.js";

export type LibraryResetResult = {
  captures_deleted: number;
  viewports_deleted: number;
  capture_dirs_removed: number;
  index_dirs_removed: number;
};

export type LibraryDeleteCapturesResult = {
  captures_deleted: number;
  capture_run_ids: string[];
  capture_dirs_removed: number;
  index_dirs_removed: number;
};

export function libraryResetConfig(root = process.cwd()): {
  confirm: string;
  path: string;
  doc: string;
  deleteCapturesPath: string;
  deleteCapturesConfirm: string;
} {
  const cfg = loadDigPaths(root).libraryReset;
  return {
    confirm: cfg?.confirm ?? "reset-library",
    path: cfg?.path ?? "/reset",
    doc: cfg?.doc ?? "knowledge/library-reset.md",
    deleteCapturesPath: cfg?.deleteCapturesPath ?? "/captures/delete",
    deleteCapturesConfirm: cfg?.deleteCapturesConfirm ?? "delete-captures"
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

export function normalizeCaptureUrlKey(raw: string): string {
  return captureIdentityKey(raw);
}

export function normalizeCaptureUrlKeys(urls: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of urls) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const key = captureIdentityKey(raw);
    if (key) keys.add(key);
  }
  return [...keys];
}

export async function listIndexedCaptureUrlKeys(client: Queryable): Promise<Set<string>> {
  const all = await client.query(`SELECT requested_url, canonical_url FROM captures`);
  const keys = new Set<string>();
  for (const row of all.rows as Array<{ requested_url?: string; canonical_url?: string }>) {
    for (const raw of [row.requested_url, row.canonical_url]) {
      const key = captureIdentityKey(String(raw ?? ""));
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Delete indexed captures whose requested_url or canonical_url matches the given list.
 * Removes matching package + index directories when present under captures/indexes roots.
 */
export async function deleteLibraryCapturesByUrls(
  client: Queryable,
  urls: string[],
  options: { capturesDir?: string; indexesDir?: string; root?: string } = {}
): Promise<LibraryDeleteCapturesResult> {
  const keys = normalizeCaptureUrlKeys(urls);
  if (!keys.length) {
    return { captures_deleted: 0, capture_run_ids: [], capture_dirs_removed: 0, index_dirs_removed: 0 };
  }

  const keySet = new Set(keys);
  const all = await client.query(
    `SELECT capture_run_id, package_path, requested_url, canonical_url FROM captures`
  );
  const targets = (
    all.rows as Array<{
      capture_run_id: string;
      package_path: string;
      requested_url: string;
      canonical_url: string;
    }>
  ).filter(
    (row) =>
      keySet.has(normalizeCaptureUrlKey(row.requested_url)) ||
      keySet.has(normalizeCaptureUrlKey(row.canonical_url))
  );

  const ids = [...new Set(targets.map((row) => row.capture_run_id))];
  if (!ids.length) {
    return { captures_deleted: 0, capture_run_ids: [], capture_dirs_removed: 0, index_dirs_removed: 0 };
  }

  await client.query(`DELETE FROM captures WHERE capture_run_id = ANY($1::text[])`, [ids]);

  const capturesDir = assertSafeLibraryDataDir(
    options.capturesDir ?? capturesDirectory(options.root),
    "captures"
  );
  const indexesDir = assertSafeLibraryDataDir(
    options.indexesDir ?? indexesDirectory(options.root),
    "indexes"
  );

  let captureDirsRemoved = 0;
  let indexDirsRemoved = 0;
  const removedCapture = new Set<string>();
  const removedIndex = new Set<string>();
  for (const row of targets) {
    const pkg = String(row.package_path || "").trim();
    if (pkg) {
      const base = basename(pkg);
      if (base && base !== "captures" && base !== "indexes" && !removedCapture.has(base)) {
        await rm(resolve(capturesDir, base), { recursive: true, force: true });
        removedCapture.add(base);
        captureDirsRemoved += 1;
      }
      if (base && !removedIndex.has(base)) {
        await rm(resolve(indexesDir, base), { recursive: true, force: true });
        removedIndex.add(base);
        indexDirsRemoved += 1;
      }
    }
    if (!removedIndex.has(row.capture_run_id)) {
      await rm(resolve(indexesDir, row.capture_run_id), { recursive: true, force: true });
      removedIndex.add(row.capture_run_id);
      indexDirsRemoved += 1;
    }
  }

  return {
    captures_deleted: ids.length,
    capture_run_ids: ids,
    capture_dirs_removed: captureDirsRemoved,
    index_dirs_removed: indexDirsRemoved
  };
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
