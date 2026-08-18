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
  assert.equal(paths.captureJobs?.maxConcurrent, 6);
  assert.equal(paths.captureJobs?.maxBatch, 1000);
  assert.equal(paths.imageIngest?.maxConcurrent, 4);
  assert.equal(paths.imageIngest?.imagesPath, "/images");
  assert.equal(paths.imageIngest?.fieldName, "files");
  assert.equal(paths.captureJobs?.automotiveOem50, "knowledge/catalogs/automotive-oem-50.json");
  assert.equal(paths.captureJobs?.crossIndustry100, "knowledge/catalogs/cross-industry-100.json");
  assert.equal(
    paths.captureJobs?.engineeringManufacturing1000,
    "knowledge/catalogs/engineering-manufacturing-1000.json"
  );
  assert.equal(paths.pinterest?.oauthAuthorize, "https://www.pinterest.com/oauth/");
  assert.equal(paths.pinterest?.islandCallbackPath, "/api/pinterest/callback");
  assert.equal(paths.pinterest?.privacyPath, "/privacy");
  assert.equal(paths.pinterest?.website, "https://spirion.projects-a.plygrnd.tech");
  assert.equal(paths.pinterest?.website, paths.coolify?.digFqdn);
  assert.equal(paths.api.pinterestPath, "/api/pinterest");
  assert.equal(paths.captureSettle?.initialWaitMs, 2500);
  assert.equal(paths.captureSettle?.settleMs, 2500);
  assert.equal(screenshotSettings().mediaType, "image/webp");
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "0" }) ?? "", /postgres:\/\//);
  assert.match(databaseUrl({ DIG_IN_CONTAINER: "1" }) ?? "", /@db:5432/);
});
