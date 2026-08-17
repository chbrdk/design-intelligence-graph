import assert from "node:assert/strict";
import test from "node:test";
import { callDigTool, listDigTools } from "../src/mcp-api.js";
import type { KnowledgeGraph } from "../src/storage.js";

const graph: KnowledgeGraph = { schema_version: "0.1.0", storage_model_version: "0.1.0", source_capture_run_id: "cap_test", indexed_at: "2026-01-01T00:00:00Z", lineage: [], nodes: [{ node_id: "a", type: "ontology_entity", label: "Button", properties: { taxonomy_id: "dig:component.button" } }, { node_id: "b", type: "ontology_entity", label: "Button", properties: { taxonomy_id: "dig:component.button" } }, { node_id: "c", type: "page", label: "Home", properties: {} }], edges: [{ edge_id: "e", type: "contains", from_node_id: "c", to_node_id: "a", properties: {} }] };

test("exposes and executes deterministic DIG retrieval tools", () => {
  const names = listDigTools().map((t) => t.name);
  assert.ok(names.includes("dig_search"));
  assert.ok(names.includes("dig_reference_search"));
  assert.ok(names.includes("dig_screen_search"));
  assert.ok(names.includes("dig_capture_prompt_pack"));
  const search = callDigTool(graph, "dig_search", { query: "button" }) as { matches: unknown[] };
  assert.equal(search.matches.length, 2);
  const neighbors = callDigTool(graph, "dig_neighbors", { node_id: "a" }) as { neighbors: unknown[] };
  assert.equal(neighbors.neighbors.length, 1);
  const recommended = callDigTool(graph, "dig_recommend", { node_id: "a" }) as { recommendations: Array<{ node_id: string }> };
  assert.equal(recommended.recommendations[0]?.node_id, "b");
});
