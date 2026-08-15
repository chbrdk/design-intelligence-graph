import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { buildEvidenceFromScenario, loadEvalScenario } from "../src/llm-eval-scenario.js";
import {
  combineScorecards,
  scoreTextTrack,
  scoreVisionTrack,
  type EvalGolden
} from "../src/llm-quality-score.js";

const golden: EvalGolden = {
  expected_screen_patterns: ["marketing", "hero"],
  expected_ui_elements: ["button", "media", "heading"],
  expected_recipe_signatures: ["media>heading>cta"],
  expected_flow_labels: ["hero"],
  expected_style_keywords: ["helvetica", "blue"],
  vision: {
    expected_heading_keywords: ["aurora", "phone"],
    expected_cta_keywords: ["learn", "more"],
    expected_layout_order: ["media", "heading", "cta"]
  }
};

test("scoreTextTrack rewards exact recipe + stage completion", () => {
  const card = scoreTextTrack(
    {
      status: "complete",
      stages_complete: 5,
      stages_total: 5,
      screen_patterns: ["marketing_hero", "product_launch"],
      ui_elements: ["primary button", "hero media", "heading"],
      recipe_signatures: ["media>heading>cta"],
      flow_labels: ["hero", "footer"],
      style_labels: ["Helvetica Neue"],
      design_summary: "Clean marketing hero with blue CTA",
      json_parse_ok: true
    },
    golden
  );
  assert.equal(card.track, "text_staged");
  assert.ok(card.percent >= 85, `expected high text score, got ${card.percent}`);
  const recipes = card.dimensions.find((d) => d.id === "recipes");
  assert.equal(recipes?.score, recipes?.max);
});

test("scoreVisionTrack matches heading/cta/layout", () => {
  const card = scoreVisionTrack(
    {
      status: "complete",
      heading: "Aurora Phone",
      cta: "Learn more",
      layout_order: ["media", "heading", "cta"]
    },
    golden
  );
  assert.equal(card.track, "vision_screen");
  assert.ok(card.percent >= 90, `expected high vision score, got ${card.percent}`);
});

test("combineScorecards averages non-skipped tracks", () => {
  const text = scoreTextTrack(
    {
      status: "complete",
      stages_complete: 5,
      stages_total: 5,
      screen_patterns: ["marketing"],
      ui_elements: ["button"],
      recipe_signatures: ["media>heading>cta"],
      flow_labels: ["hero"],
      style_labels: ["helvetica"],
      design_summary: "blue accent",
      json_parse_ok: true
    },
    golden
  );
  const vision = scoreVisionTrack(
    {
      status: "complete",
      heading: "Aurora Phone",
      cta: "Learn more",
      layout_order: ["media", "heading", "cta"]
    },
    golden
  );
  const skipped = scoreVisionTrack({ status: "skipped", error: "text-only" }, golden);
  const combined = combineScorecards([text, vision]);
  assert.ok(combined.overall_percent > 0);
  assert.equal(combined.text_percent, text.percent);
  assert.equal(combined.vision_percent, vision.percent);
  const textOnly = combineScorecards([text, skipped]);
  assert.equal(textOnly.vision_percent, null);
  assert.equal(textOnly.overall_percent, text.percent);
});

test("marketing-hero scenario loads and builds evidence", async () => {
  const scenarioDir = resolve(process.cwd(), "fixtures/eval/marketing-hero");
  const scenario = await loadEvalScenario(scenarioDir);
  assert.equal(scenario.id, "marketing-hero");
  const evidence = buildEvidenceFromScenario(scenario);
  assert.equal(evidence.canonical_url, scenario.canonical_url);
  assert.equal(evidence.section_compositions?.[0]?.signature, "media>heading>cta");
  assert.ok((evidence.ontologies[0]?.entities.length ?? 0) >= 3);
});
