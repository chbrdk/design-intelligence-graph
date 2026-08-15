import assert from "node:assert/strict";
import test from "node:test";
import { assertCollectionScopeAllowed } from "../src/design-reference-library.js";
import { listDigTools, callDigTool } from "../src/mcp-api.js";
import type { KnowledgeGraph } from "../src/storage.js";

test("listDigTools includes dig_reference_* Wave 2 tools", () => {
  const names = listDigTools().map((t) => t.name);
  assert.ok(names.includes("dig_reference_search"));
  assert.ok(names.includes("dig_reference_get"));
  assert.ok(names.includes("dig_reference_pack"));
  const search = listDigTools().find((t) => t.name === "dig_reference_search");
  assert.ok(search?.inputSchema && "similar_to" in (search.inputSchema.properties as object));
});

test("assertCollectionScopeAllowed requires platformProjectId in live mode", () => {
  const prev = process.env.DIG_FEDERATION_MODE;
  process.env.DIG_FEDERATION_MODE = "live";
  assert.throws(() => assertCollectionScopeAllowed(null), /platformProjectId required/);
  assert.doesNotThrow(() => assertCollectionScopeAllowed("pp-1"));
  if (prev === undefined) delete process.env.DIG_FEDERATION_MODE;
  else process.env.DIG_FEDERATION_MODE = prev;
});

test("assertCollectionScopeAllowed allows missing scope in dummy mode", () => {
  const prev = process.env.DIG_FEDERATION_MODE;
  process.env.DIG_FEDERATION_MODE = "dummy";
  assert.doesNotThrow(() => assertCollectionScopeAllowed(null));
  if (prev === undefined) delete process.env.DIG_FEDERATION_MODE;
  else process.env.DIG_FEDERATION_MODE = prev;
});

test("callDigTool rejects dig_reference_* (async path)", () => {
  const graph: KnowledgeGraph = {
    schema_version: "0.1.0",
    storage_model_version: "0.1.0",
    source_capture_run_id: "run_test",
    indexed_at: "2026-01-01T00:00:00Z",
    nodes: [],
    edges: [],
    lineage: []
  };
  assert.throws(
    () => callDigTool(graph, "dig_reference_search", { query: "hero" }),
    /callDigReferenceTool/
  );
});
