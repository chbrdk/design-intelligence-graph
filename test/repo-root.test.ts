import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { resolveRepoRoot } from "../src/repo-root.js";

test("resolveRepoRoot finds knowledge/paths.json from src module", () => {
  const root = resolveRepoRoot();
  assert.ok(existsSync(resolve(root, "knowledge/paths.json")));
  assert.ok(existsSync(resolve(root, "schemas/design-reference.schema.json")));
});
