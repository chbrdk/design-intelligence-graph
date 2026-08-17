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
  assert.equal(paths.libraryReset?.confirm, "reset-library");
  assert.equal(paths.captureJobs?.maxConcurrent, 3);
  assert.equal(paths.captureJobs?.maxBatch, 100);
  assert.equal(paths.captureJobs?.automotiveOem50, "knowledge/catalogs/automotive-oem-50.json");
  assert.equal(paths.captureJobs?.crossIndustry100, "knowledge/catalogs/cross-industry-100.json");
  assert.equal(paths.captureSettle?.initialWaitMs, 2500);
  assert.equal(paths.captureSettle?.settleMs, 2500);
  assert.equal(screenshotSettings().mediaType, "image/webp");
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "0" }) ?? "", /postgres:\/\//);
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "1" }) ?? "", /@db:5432/);
});
