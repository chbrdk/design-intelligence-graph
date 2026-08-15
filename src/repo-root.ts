import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Repo root containing `knowledge/paths.json`.
 * Works from `src/` (dev) and `dist/src/` (Docker `node dist/src/...`).
 */
export function resolveRepoRoot(fromModuleUrl: string = import.meta.url): string {
  let dir = resolve(dirname(fileURLToPath(fromModuleUrl)), "..");
  for (let i = 0; i < 5; i++) {
    if (existsSync(resolve(dir, "knowledge/paths.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(dirname(fileURLToPath(fromModuleUrl)), "..");
}
