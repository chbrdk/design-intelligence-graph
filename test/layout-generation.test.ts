import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { deriveLayoutFromReferencePack, deriveLayoutSpecification } from "../src/layout-generation.js";
import type { DesignReferenceRecord } from "../src/design-reference-emit.js";

test("creates a lineage-preserving structural layout specification", () => {
  const spec = deriveLayoutSpecification({
    schema_version: "0.1.0",
    storage_model_version: "0.1.0",
    source_capture_run_id: "cap_test",
    indexed_at: "",
    lineage: [],
    edges: [],
    nodes: [
      {
        node_id: "ont_1",
        type: "ontology_entity",
        label: "Hero",
        properties: { taxonomy_id: "dig:pattern.hero" }
      }
    ]
  });
  assert.equal(spec.blocks[0]?.taxonomy_id, "dig:pattern.hero");
  assert.equal(spec.blocks[0]?.source_node_ids[0], "ont_1");
  assert.equal(spec.breakpoints.length, 3);
  assert.equal(spec.intent, "evidence_based_structural_synthesis");
});

test("look_conditioned path uses pack signature when graph present", () => {
  const aurora = JSON.parse(
    readFileSync("fixtures/design-references/aurora-hero.reference.json", "utf8")
  ) as DesignReferenceRecord;
  const spec = deriveLayoutFromReferencePack({
    pack: {
      schema_version: "0.1.0",
      intent: "hero",
      references: [aurora],
      synthesis_mode: "look_conditioned",
      constraints: { forbid_source_copy: true }
    },
    graph: {
      schema_version: "0.1.0",
      storage_model_version: "0.1.0",
      source_capture_run_id: "cap_look",
      indexed_at: "",
      lineage: [
        {
          artifact_path: "graph.json",
          sha256: "abc",
          bytes: 1,
          media_type: "application/json"
        }
      ],
      edges: [],
      nodes: [
        {
          node_id: "ont_media",
          type: "ontology_entity",
          label: "Media",
          properties: { taxonomy_id: "dig:component.media" }
        }
      ]
    }
  });
  assert.equal(spec.intent, "look_conditioned_structural_synthesis");
  assert.equal(spec.provenance.seed, "graph");
  assert.equal(spec.blocks[0]?.source_node_ids[0], "ont_media");
  assert.equal(spec.look_contract?.colors.accent, "#0071e3");
  assert.ok(spec.constraints.some((line) => line.includes("glassmorphism")));
});
