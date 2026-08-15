import assert from "node:assert/strict";
import test from "node:test";
import { API_ENRICHMENT_PATH, API_LIBRARY_PATH } from "./dig-config.ts";
import { stageIndex, stageLabel, stagePhase } from "./stages.ts";

test("stage labels map detection and ingestion clearly", () => {
  assert.equal(stageLabel("capturing"), "Detection");
  assert.equal(stageLabel("analyzing"), "Design AI");
  assert.equal(stageLabel("indexing"), "Ingestion");
  assert.equal(stagePhase("capturing"), "detection");
  assert.equal(stagePhase("analyzing"), "analysis");
  assert.equal(stagePhase("verifying"), "ingestion");
  assert.equal(stageIndex("indexing"), 4);
  assert.equal(stageIndex("failed"), -1);
});

test("API paths come from knowledge/paths.json", () => {
  assert.equal(API_LIBRARY_PATH, "/api/library");
  assert.equal(API_ENRICHMENT_PATH, "/api/enrichment");
});
