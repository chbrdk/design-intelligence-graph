import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertSafeLibraryDataDir,
  deleteLibraryCapturesByUrls,
  libraryResetConfig,
  normalizeCaptureUrlKeys,
  resetLibraryCatalog
} from "../src/library-reset.js";

test("libraryResetConfig reads paths.json confirm phrase", () => {
  const cfg = libraryResetConfig();
  assert.equal(cfg.confirm, "reset-library");
  assert.equal(cfg.path, "/reset");
  assert.equal(cfg.deleteCapturesPath, "/captures/delete");
  assert.equal(cfg.deleteCapturesConfirm, "delete-captures");
});

test("normalizeCaptureUrlKeys collapses www, trailing slash, and hash", () => {
  assert.deepEqual(normalizeCaptureUrlKeys(["https://www.amazon.com/", "https://amazon.com/#x"]), [
    "amazon.com"
  ]);
});

test("assertSafeLibraryDataDir rejects unexpected basenames", () => {
  assert.equal(assertSafeLibraryDataDir("/data/captures", "captures"), "/data/captures");
  assert.throws(() => assertSafeLibraryDataDir("/tmp/not-captures", "captures"), /refusing to empty/);
});

test("deleteLibraryCapturesByUrls removes matching rows and package dirs", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-lib-del-"));
  const capturesDir = join(root, "captures");
  const indexesDir = join(root, "indexes");
  await mkdir(join(capturesDir, "pkg_amazon"), { recursive: true });
  await writeFile(join(capturesDir, "pkg_amazon", "manifest.json"), "{}");
  await mkdir(join(indexesDir, "pkg_amazon"), { recursive: true });
  await mkdir(join(capturesDir, "pkg_toyota"), { recursive: true });
  await writeFile(join(capturesDir, "pkg_toyota", "manifest.json"), "{}");

  const deleted: string[] = [];
  const client = {
    async query(text: string, values?: unknown[]) {
      if (text.includes("SELECT capture_run_id, package_path")) {
        return {
          rows: [
            {
              capture_run_id: "cap_amazon",
              package_path: join(capturesDir, "pkg_amazon"),
              requested_url: "https://www.amazon.com/",
              canonical_url: "https://www.amazon.com/"
            },
            {
              capture_run_id: "cap_toyota",
              package_path: join(capturesDir, "pkg_toyota"),
              requested_url: "https://www.toyota.com/",
              canonical_url: "https://www.toyota.com/"
            }
          ]
        };
      }
      if (text.startsWith("DELETE FROM captures")) {
        deleted.push(...((values?.[0] as string[]) ?? []));
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const result = await deleteLibraryCapturesByUrls(client, ["https://www.amazon.com/"], {
    capturesDir,
    indexesDir
  });
  assert.equal(result.captures_deleted, 1);
  assert.deepEqual(result.capture_run_ids, ["cap_amazon"]);
  assert.deepEqual(deleted, ["cap_amazon"]);
  assert.equal((await readdir(capturesDir)).includes("pkg_amazon"), false);
  assert.equal((await readdir(capturesDir)).includes("pkg_toyota"), true);
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
