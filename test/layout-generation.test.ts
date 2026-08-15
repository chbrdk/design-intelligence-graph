import assert from "node:assert/strict";
import test from "node:test";
import { deriveLayoutSpecification } from "../src/layout-generation.js";
test("creates a lineage-preserving structural layout specification", () => {
  const spec = deriveLayoutSpecification({ schema_version: "0.1.0", storage_model_version: "0.1.0", source_capture_run_id: "cap_test", indexed_at: "", lineage: [], edges: [], nodes: [{ node_id: "ont_1", type: "ontology_entity", label: "Hero", properties: { taxonomy_id: "dig:pattern.hero" } }] });
  assert.equal(spec.blocks[0]?.taxonomy_id, "dig:pattern.hero"); assert.equal(spec.blocks[0]?.source_node_ids[0], "ont_1"); assert.equal(spec.breakpoints.length, 3);
});
