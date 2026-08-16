import assert from "node:assert/strict";
import test from "node:test";
import {
  closeTruncatedJson,
  extractJsonObjectLoose,
  recoverDesignSynthesisSkeleton
} from "../src/json-repair.js";
import { buildRebuildBriefMarkdown } from "../src/rebuild-brief.js";
import { isSectionEchoSummary, pageSummaryFromMobbin } from "../src/llm-design.js";

test("extractJsonObjectLoose closes truncated synthesize JSON", () => {
  const truncated = `{"design_summary":"Premium automotive homepage with media-led hero and product bands.","hypotheses":[{"category":"page_archetype","value":"Brand Hero","confidence":0.9,"rationale":"Hero media dominates.","evidence_refs":["hero"]},{"category":"visual_style","value":"dark monochrome","confidence":0.8,"rationale":"High contrast","evidence_refs":["style"`;
  const parsed = extractJsonObjectLoose(truncated) as {
    design_summary: string;
    hypotheses: unknown[];
  };
  assert.match(parsed.design_summary, /Premium automotive/);
  assert.ok(Array.isArray(parsed.hypotheses));
  assert.ok(parsed.hypotheses.length >= 1);
});

test("recoverDesignSynthesisSkeleton extracts summary when array is mangled", () => {
  const raw = `{"design_summary":"A long enough page summary about the whole homepage structure and conversion.","hypotheses":[broken`;
  const recovered = recoverDesignSynthesisSkeleton(raw);
  assert.ok(recovered);
  assert.match(recovered!.design_summary, /whole homepage/);
});

test("closeTruncatedJson balances braces", () => {
  const closed = closeTruncatedJson('{"a":{"b":[1,2');
  assert.doesNotThrow(() => JSON.parse(closed));
});

test("pageSummaryFromMobbin prefers vision beats and avoids technical echo", () => {
  const summary = pageSummaryFromMobbin({
    screen_patterns: [{ name: "Brand Hero", confidence: 0.9, evidence_refs: [] }],
    ui_elements: [],
    recipe_insights: [],
    page_flow: [],
    visual_style_labels: [{ name: "high-contrast monochrome", confidence: 0.8, evidence_refs: [] }],
    section_descriptions: [
      {
        section_id: "a",
        signature: "media",
        category: "hero",
        stack_summary: "full-bleed media_large absolute cover",
        look_summary:
          "This above-fold hero section is tall. Vision: car centered with text overlay Atmosphere: dark scrim Media: car",
        confidence: 0.9,
        evidence_refs: []
      },
      {
        section_id: "b",
        signature: "heading>cta",
        category: "feature",
        stack_summary: "editorial band",
        look_summary: "Editorial feature with left copy and right media.",
        confidence: 0.8,
        evidence_refs: []
      }
    ]
  });
  assert.match(summary, /Brand Hero/i);
  assert.match(summary, /car centered|dark scrim/i);
  assert.equal(isSectionEchoSummary(summary), false);
  assert.equal(isSectionEchoSummary("Page flow leans hero → nav. Key bands: hero (media): full-bleed media_large absolute cover."), true);
});

test("buildRebuildBriefMarkdown includes vision and constraints", () => {
  const md = buildRebuildBriefMarkdown({
    captureRunId: "cap_test",
    url: "https://www.porsche.com/germany/",
    llm: {
      schema_version: "0.1.0",
      llm_design_version: "0.2.0",
      generated_at: new Date().toISOString(),
      model: "test",
      base_url: "http://local",
      status: "complete",
      design_summary: "Premium automotive homepage with media-led hero storytelling.",
      hypotheses: [
        {
          hypothesis_id: "h1",
          category: "page_archetype",
          value: "Brand Hero",
          confidence: 0.9,
          rationale: "Hero dominates",
          evidence_refs: [],
          layer: "L3",
          method: "gemma_design_analysis"
        }
      ],
      mobbin: {
        screen_patterns: [{ name: "Brand Hero", confidence: 0.9, evidence_refs: [] }],
        ui_elements: [],
        recipe_insights: [],
        page_flow: [],
        visual_style_labels: [{ name: "monochrome", confidence: 0.8, evidence_refs: [] }],
        section_descriptions: [
          {
            section_id: "sec_hero",
            signature: "media",
            category: "hero",
            stack_summary: "media",
            look_summary: "Hero. Vision: night car with bottom scrim",
            confidence: 0.9,
            evidence_refs: [],
            media: { role: "hero", object_fit: "contain", notes: "" }
          }
        ]
      },
      vision: {
        status: "complete",
        heading: "Fachbau RS.",
        cta: "Alle anzeigen",
        layout_order: ["media", "heading", "cta"]
      }
    }
  });
  assert.match(md, /Fachbau RS/);
  assert.match(md, /Rebuild constraints/);
  assert.match(md, /night car/);
});
