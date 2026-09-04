import assert from "node:assert/strict";
import test from "node:test";
import type { DesignReferenceRecord } from "../src/design-reference-emit.js";
import {
  evaluateGenerateReferenceGate,
  generateReferenceGateConfig,
  styleLabelForReference
} from "../src/generate-reference-gate.js";

function ref(
  id: string,
  capture: string,
  style: string | null
): DesignReferenceRecord {
  return {
    schema_version: "0.1.0",
    reference_id: id,
    capture_run_id: capture,
    scope: "section",
    section_id: null,
    viewport_capture_id: null,
    taxonomy: { category: "hero" },
    composition: { signature: "Hero", stack_summary: "hero" },
    look: { look_summary: "Quiet type", confidence: 0.8 },
    ...(style
      ? { tokens: { style_labels: [style] } }
      : {}),
    provenance: { evidence_refs: [], methods: [], layers: [] }
  };
}

test("generateReferenceGateConfig exposes diversity defaults", () => {
  const cfg = generateReferenceGateConfig();
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.minDomains, 3);
  assert.equal(cfg.maxSameStyle, 2);
  assert.equal(cfg.minReferences, 3);
});

test("styleLabelForReference normalizes atmosphere labels", () => {
  assert.equal(styleLabelForReference(ref("a", "cap_a", "minimal calm")), "minimal");
  assert.equal(styleLabelForReference(ref("b", "cap_b", null)), null);
});

test("evaluateGenerateReferenceGate fails sticky same-domain same-style packs", () => {
  const domains = new Map<string, string | null>([
    ["cap_a", "hub.example"],
    ["cap_b", "hub.example"],
    ["cap_c", "hub.example"]
  ]);
  const sticky = evaluateGenerateReferenceGate(
    [ref("r1", "cap_a", "minimal"), ref("r2", "cap_b", "minimal"), ref("r3", "cap_c", "minimal")],
    domains
  );
  assert.equal(sticky.ok, false);
  assert.ok(sticky.warnings.some((w) => w.includes("domains")));
  assert.ok(sticky.warnings.some((w) => w.includes("style_repeat")));

  const diverse = evaluateGenerateReferenceGate(
    [
      ref("r1", "cap_a", "minimal"),
      ref("r2", "cap_b", "editorial"),
      ref("r3", "cap_c", "corporate")
    ],
    new Map([
      ["cap_a", "a.example"],
      ["cap_b", "b.example"],
      ["cap_c", "c.example"]
    ])
  );
  assert.equal(diverse.ok, true);
  assert.equal(diverse.domain_count, 3);
  assert.ok(diverse.max_style_count <= 2);
});
