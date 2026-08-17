import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertSafeLibraryDataDir, libraryResetConfig, resetLibraryCatalog } from "../src/library-reset.js";

test("libraryResetConfig reads paths.json confirm phrase", () => {
  const cfg = libraryResetConfig();
  assert.equal(cfg.confirm, "reset-library");
  assert.equal(cfg.path, "/reset");
});

test("assertSafeLibraryDataDir rejects unexpected basenames", () => {
  assert.equal(assertSafeLibraryDataDir("/data/captures", "captures"), "/data/captures");
  assert.throws(() => assertSafeLibraryDataDir("/tmp/not-captures", "captures"), /refusing to empty/);
});

test("resetLibraryCatalog truncates catalog tables and empties capture/index dirs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-lib-reset-"));
  const capturesDir = join(root, "captures");
  const indexesDir = join(root, "indexes");
  await mkdir(join(capturesDir, "pkg_old"), { recursive: true });
  await writeFile(join(capturesDir, "pkg_old", "manifest.json"), "{}");
  await mkdir(join(indexesDir, "graphs"), { recursive: true });
  await writeFile(join(indexesDir, "graphs", "g.json"), "{}");

  const sql: string[] = [];
  const client = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("FROM captures")) return { rows: [{ count: 45 }] };
      if (text.includes("FROM viewports")) return { rows: [{ count: 128 }] };
      return { rows: [] };
    }
  };

  const result = await resetLibraryCatalog(client, { capturesDir, indexesDir });
  assert.equal(result.captures_deleted, 45);
  assert.equal(result.viewports_deleted, 128);
  assert.equal(result.capture_dirs_removed, 1);
  assert.equal(result.index_dirs_removed, 1);
  assert.equal((await readdir(capturesDir)).length, 0);
  assert.equal((await readdir(indexesDir)).length, 0);
  assert.ok(sql.some((item) => item.includes("TRUNCATE TABLE captures")));
  assert.ok(sql.some((item) => item.includes("UPDATE dig_projects")));
});
