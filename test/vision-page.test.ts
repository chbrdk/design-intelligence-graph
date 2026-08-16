import assert from "node:assert/strict";
import test from "node:test";
import { parseVisionPageResponse } from "../src/vision-page.js";

test("parseVisionPageResponse extracts catalog fields", () => {
  const raw = JSON.stringify({
    page_type: "Automotive landing",
    overall_atmosphere: "Dark premium night shoot",
    color_mood: "Near-black with amber accents",
    typography_feel: "Wide sans display over media",
    above_the_fold: "Full-bleed car hero with left headline and lower CTA.",
    vertical_rhythm: "Hero → model grid → lifestyle → footer",
    media_strategy: "Photographic product CG with lifestyle inserts",
    notable_modules: ["Hero", "Model grid", "Lifestyle"],
    brand_cues: "Wordmark top-left",
    interaction_chrome: "Sticky nav",
    category_tags: ["Hero_Media", "product_grid"],
    rebuild_hints: "Keep full-bleed hero; grid of 3 cards below.",
    heading: "New Model",
    cta: "Configure",
    layout_order: ["media", "heading", "cta"],
    confidence: 0.88
  });
  const parsed = parseVisionPageResponse(raw);
  assert.equal(parsed.page_type, "Automotive landing");
  assert.equal(parsed.heading, "New Model");
  assert.equal(parsed.cta, "Configure");
  assert.deepEqual(parsed.layout_order, ["media", "heading", "cta"]);
  assert.deepEqual(parsed.category_tags, ["hero_media", "product_grid"]);
  assert.equal(parsed.confidence, 0.88);
  assert.match(parsed.rebuild_hints, /full-bleed/i);
});

test("parseVisionPageResponse tolerates fenced JSON and trailing commas", () => {
  const raw = "```json\n{\"page_type\":\"Home\",\"overall_atmosphere\":\"Bright\",\"color_mood\":\"White\",\"typography_feel\":\"Sans\",\"above_the_fold\":\"Top\",\"vertical_rhythm\":\"Stack\",\"media_strategy\":\"Photo\",\"notable_modules\":[],\"brand_cues\":\"\",\"interaction_chrome\":\"\",\"category_tags\":[],\"rebuild_hints\":\"Keep clean\",\"heading\":\"Hi\",\"cta\":\"Go\",\"layout_order\":[\"heading\"],\"confidence\":0.7,}\n```";
  const parsed = parseVisionPageResponse(raw);
  assert.equal(parsed.page_type, "Home");
  assert.equal(parsed.heading, "Hi");
});
