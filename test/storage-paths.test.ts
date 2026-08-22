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
  assert.equal(paths.embeddings?.dense?.model, "qwen/qwen3-embedding-8b");
  assert.equal(paths.embeddings?.dense?.dims, 1024);
  assert.equal(paths.embeddings?.denseDoc, "knowledge/dense-embeddings.md");
  assert.equal(paths.embeddings?.screenshotDoc, "knowledge/screenshot-embeddings.md");
  assert.equal(paths.embeddings?.screenshot?.model, "google/gemini-embedding-2");
  assert.equal(paths.embeddings?.screenshot?.dims, 768);
  assert.equal(paths.similarityGraph?.nodeCap, 5000);
  assert.equal(paths.islandSurfaces?.graphRoute, "/graph");
  assert.equal(paths.api.libraryPath, "/api/library");
  assert.equal(paths.libraryReset?.confirm, "reset-library");
  assert.equal(paths.captureJobs?.maxConcurrent, 4);
  assert.equal(paths.captureJobs?.hardTimeoutMs, 480000);
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
  assert.equal(paths.captureJobs?.insurance1000, "knowledge/catalogs/insurance-1000.json");
  assert.equal(paths.captureJobs?.insurancePlus500, "knowledge/catalogs/insurance-plus-500.json");
  assert.equal(paths.captureJobs?.designDiversity1000, "knowledge/catalogs/design-diversity-1000.json");
  assert.equal(paths.captureJobs?.publicSector1000, "knowledge/catalogs/public-sector-1000.json");
  assert.equal(paths.captureJobs?.publicSectorPlus500, "knowledge/catalogs/public-sector-plus-500.json");
  assert.equal(paths.captureJobs?.awwwards500, "knowledge/catalogs/awwwards-500.json");
  assert.equal(paths.captureJobs?.awwwardsPlus1000, "knowledge/catalogs/awwwards-plus-1000.json");
  assert.equal(paths.captureJobs?.awwwardsPlus2000, "knowledge/catalogs/awwwards-plus-2000.json");
  assert.equal(paths.islandChunkReload?.storageKey, "spirion.v1.chunkReload");
  assert.equal(paths.islandChunkReload?.maxAttempts, 2);
  assert.deepEqual(paths.libraryModuleGallery?.categories, [
    "hero",
    "nav",
    "feature",
    "conversion",
    "commerce",
    "social_proof",
  ]);
  assert.equal(paths.libraryModuleGallery?.queryParam, "module");
  assert.equal(paths.islandSurfaces?.homeRecentCount, 8);
  assert.equal(paths.northlineRebuild?.route, "/rebuild/northline");
  assert.equal(paths.northlineRebuild?.captureRunId, "cap_42a3ef1cc922444b8ab0c6148df0a93f");
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
