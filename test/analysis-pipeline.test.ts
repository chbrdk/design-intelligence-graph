import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnalysisReport } from "../src/analysis-pipeline.js";
import { evaluateQuality } from "../src/quality.js";

test("orchestrates deterministic stages and leaves unconfigured AI stages explicit", () => {
  const report = deriveAnalysisReport({
    logical_elements: [], transformations: [], geometry_layouts: [], ontologies: [], visual_language: [], visual_hypotheses: [],
    quality: evaluateQuality({ subsystem_success: 1, geometry_coverage: 1, style_coverage: 1, screenshot_completeness: 1, accessibility_coverage: 1, asset_completeness: 1, font_completeness: 1, network_completion: 1, state_restoration: 1, scroll_restoration: 1 })
  });
  assert.equal(report.stages.find((stage) => stage.kind === "vision")?.status, "not_attempted");
  assert.equal(report.stages.find((stage) => stage.kind === "llm")?.status, "not_attempted");
  assert.equal(report.quality.gate, "pass");
  assert.ok(report.findings.every((finding) => finding.layer === "L2" && finding.confidence === 1));
});
