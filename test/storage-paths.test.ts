import assert from "node:assert/strict";
import test from "node:test";
import { screenshotSettings } from "../src/screenshot-settings.js";
import { databaseUrl, loadDigPaths } from "../src/runtime-paths.js";

test("paths expose webp and database config", () => {
  const paths = loadDigPaths();
  assert.equal(paths.captureLimits?.screenshotFormat, "webp");
  assert.equal(paths.captureLimits?.matchedStylesMode, "essential");
  assert.equal(paths.database?.image, "pgvector/pgvector:0.8.6-pg18-trixie");
  assert.equal(paths.embeddings?.dims, 384);
  assert.equal(paths.api.libraryPath, "/api/library");
  assert.equal(screenshotSettings().mediaType, "image/webp");
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "0" }) ?? "", /postgres:\/\//);
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "1" }) ?? "", /@db:5432/);
});
