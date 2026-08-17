import assert from "node:assert/strict";
import test from "node:test";
import { buildPageRhythm, pageRhythmRules } from "../src/page-rhythm.js";
import type { StructureSpineDocument } from "../src/structure-spine.js";

function spine(partial: Partial<StructureSpineDocument> & Pick<StructureSpineDocument, "page_arc" | "bands">): StructureSpineDocument {
  return {
    schema_version: "0.1.0",
    structure_spine_version: "0.1.0",
    generated_at: new Date().toISOString(),
    source: {
      viewport_name: "desktop",
      viewport_capture_id: "vpc",
      section_compositions_path: "derived/section-compositions.json"
    },
    above_fold: {
      ingredients: ["media", "headline", "cta"],
      summary: "hero(media>heading>cta)",
      section_ids: ["hero"]
    },
    demoted_count: 2,
    demoted_samples: [],
    ...partial
  };
}

test("buildPageRhythm from spine keeps arc and forbids card-kit hero", () => {
  const rhythm = buildPageRhythm({
    spine: spine({
      page_arc: "nav → hero → feature → footer",
      bands: [
        {
          section_id: "nav",
          category: "nav",
          signature: "nav",
          beat: "Top chrome",
          zone: "above_fold",
          confidence: 0.9,
          y: 0,
          height: 80
        },
        {
          section_id: "hero",
          category: "hero",
          signature: "media>heading>cta",
          beat: "Full-bleed cinematic open",
          zone: "above_fold",
          confidence: 0.9,
          y: 80,
          height: 900
        },
        {
          section_id: "feat",
          category: "feature",
          signature: "heading>body",
          beat: "Capability stack",
          zone: "mid",
          confidence: 0.8,
          y: 1000,
          height: 600
        },
        {
          section_id: "foot",
          category: "footer",
          signature: "nav",
          beat: "Closing chrome",
          zone: "below",
          confidence: 0.8,
          y: 1600,
          height: 200
        }
      ]
    })
  });
  assert.ok(rhythm);
  assert.equal(rhythm.page_arc, "nav → hero → feature → footer");
  assert.equal(rhythm.bands[1]?.category, "hero");
  assert.ok((rhythm.above_fold.height ?? 0) > 0.4);
  assert.ok(rhythm.avoid.includes("card grid in the hero"));
  assert.ok(rhythm.avoid.includes("feature grid inside the hero"));
  const rules = pageRhythmRules(rhythm);
  assert.ok(rules.some((line) => line.includes("nav → hero → feature → footer")));
  assert.ok(rules.some((line) => /Opening height is ~\d+%/.test(line)));
});

test("buildPageRhythm falls back to vision_layout bands", () => {
  const rhythm = buildPageRhythm({
    vision_layout: {
      status: "complete",
      bands: [
        {
          id: "b1",
          label: "Hero media",
          category: "hero",
          box: { x: 0, y: 0, width: 1, height: 0.32 },
          confidence: 0.9
        },
        {
          id: "b2",
          label: "Features",
          category: "feature",
          box: { x: 0, y: 0.32, width: 1, height: 0.4 },
          confidence: 0.8
        },
        {
          id: "b3",
          label: "Footer",
          category: "footer",
          box: { x: 0, y: 0.85, width: 1, height: 0.15 },
          confidence: 0.8
        }
      ]
    }
  });
  assert.ok(rhythm);
  assert.equal(rhythm.page_arc, "hero → feature → footer");
  assert.equal(rhythm.bands[0]?.zone, "above_fold");
  assert.equal(rhythm.bands[2]?.zone, "below");
});
