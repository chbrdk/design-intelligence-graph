import assert from "node:assert/strict";
import test from "node:test";
import { deriveKnowledgeGraph, searchKnowledgeGraph } from "../src/storage.js";
import type { CaptureManifest } from "../src/types.js";

const manifest = {
  capture_run_id: "cap_test", site: { site_id: "site_test", domain: "example.com", scheme: "https", canonical_origin: "https://example.com" }, page: { page_id: "pg_test", site_id: "site_test", route: "/", url: "https://example.com", canonical_url: "https://example.com" }, status: "complete", completed_at: "2026-01-01T00:00:00Z",
  run_artifacts: {}, viewport_captures: [{ viewport_capture_id: "vpc_test", name: "desktop", viewport: { width: 100, height: 100, device_scale_factor: 1 }, document: { width: 100, height: 100 }, status: "complete", artifacts: {} }]
} as unknown as CaptureManifest;

test("projects capture artifacts into a lineage-preserving graph", () => {
  const graph = deriveKnowledgeGraph({ manifest, logical: { logical_elements: [{ logical_element_id: "lel_test", members: [{ viewport_capture_id: "vpc_test", node_id: "node_test" }], match_confidence: 1, match_method: "test" }] }, ontology: { viewports: [{ viewport_capture_id: "vpc_test", entities: [{ ontology_entity_id: "ont_test", taxonomy_id: "dig:component.button", label: "Button", parent_entity_id: null, logical_element_id: "lel_test", confidence: 1, layer: "L2", method: "test" }], relationships: [] }] }, analysis: { findings: [{ finding_id: "coverage", kind: "coverage", value: 1, unit: "ratio", confidence: 1, method: "test" }], semantic_inputs: [] } });
  assert.ok(graph.nodes.some((node) => node.node_id === "ont_test"));
  assert.ok(graph.edges.some((edge) => edge.type === "instantiates"));
  assert.equal(searchKnowledgeGraph(graph, "button")[0]?.node_id, "ont_test");
});
