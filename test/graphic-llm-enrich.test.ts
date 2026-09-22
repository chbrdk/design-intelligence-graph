import assert from "node:assert/strict";
import test from "node:test";
import {
  asCompositionContract,
  emptyCompositionContract
} from "../src/composition-contract.js";
import { refineCompositionFromVision } from "../src/graphic-llm-enrich.js";
import type { VisionPageDocument } from "../src/vision-page.js";

test("refineCompositionFromVision merges layout and avoid hints", () => {
  const base = asCompositionContract({
    ...emptyCompositionContract(),
    focal: "claim",
    layoutFamily: "centered-lockup",
    negativeSpace: "balanced",
    avoid: ["busy-center"]
  })!;
  const page = {
    schema_version: "0.1.0",
    vision_page_version: "0.2.0",
    generated_at: new Date().toISOString(),
    source_screenshot: "viewports/artboard/artboard.webp",
    page_type: "print ad",
    overall_atmosphere: "dark luxury",
    color_mood: "crimson on charcoal",
    typography_feel: "monumental serif display",
    above_the_fold: "full artboard claim",
    vertical_rhythm: "single plane",
    media_strategy: "full bleed product",
    notable_modules: [],
    brand_cues: "logo top left",
    interaction_chrome: "none",
    category_tags: ["campaign"],
    rebuild_hints: "keep bleed quiet zone",
    heading: "Claim",
    cta: "",
    layout_order: ["brand", "claim"],
    confidence: 0.8,
    spacing_feel: "airy open margins",
    layout_system: "full bleed product lockup",
    ux_risks: ["tiny-legal-collision"],
    status: "complete"
  } as VisionPageDocument;

  const refined = refineCompositionFromVision(base, page);
  assert.equal(refined.negativeSpace, "airy");
  assert.equal(refined.layoutFamily, "full-bleed-product");
  assert.ok(refined.avoid.includes("busy-center"));
  assert.ok(refined.avoid.includes("tiny-legal-collision"));
  assert.match(refined.typeRoles.display ?? "", /monumental/i);
});
