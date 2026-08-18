import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assembleCompositionBrief } from "../src/compose-brief.js";

test("assembleCompositionBrief merges references into a builder brief", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-compose-brief-"));
  await mkdir(join(root, "derived"), { recursive: true });
  await writeFile(
    join(root, "derived/vision-page.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      vision_page_version: "0.2.0",
      generated_at: new Date().toISOString(),
      source_screenshot: "viewports/desktop/screenshots/full-page.webp",
      page_type: "real_estate_platform_landing_page",
      overall_atmosphere: "minimal editorial",
      color_mood: "monochrome slate",
      typography_feel: "bold editorial",
      above_the_fold: "Overlapping display type with 3D render and stats column.",
      vertical_rhythm: "mixed",
      layout_system: "mixed",
      media_strategy: "single architectural render with grayscale reprise",
      notable_modules: ["stats_column", "inverted_card"],
      brand_cues: "",
      interaction_chrome: "tiny nav and simple icons",
      category_tags: ["real_estate"],
      rebuild_hints: "",
      visual_craft: {
        type_image_relationship: "headline overlaps the architecture render",
        typography_composition: "massive display caps and tiny tracked body",
        imagery_craft: "single architectural render and grayscale reprise",
        spatial_craft: "asymmetric hero",
        chrome_vs_content: "minimal chrome against editorial type",
        rebuild_spec: ""
      },
      heading: "CITY ARCADE",
      cta: "Start search",
      layout_order: ["heading", "media", "cta"],
      confidence: 0.8,
      spacing_feel: "tight",
      status: "complete"
    }),
    "utf8"
  );
  await writeFile(
    join(root, "derived/page-rhythm.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      page_rhythm_version: "0.1.0",
      page_arc: "nav -> hero -> features -> cta",
      above_fold: { ingredients: ["nav", "hero", "stats"], summary: "Editorial hero", height: 900 },
      bands: [{ zone: "above_fold", category: "hero", signature: "media>heading>cta", beat: "overlap", height: 900 }],
      avoid: ["card-grid hero"]
    }),
    "utf8"
  );

  const refs = [
    {
      reference_id: "ref_estate_hero",
      capture_run_id: "cap_estate",
      scope: "section",
      section_id: "sec_hero",
      viewport_capture_id: "vpc_estate",
      taxonomy: { category: "hero", taxonomy_ids: ["dig:pattern.hero"], screen_patterns: ["stats_column"] },
      composition: { signature: "media>heading>cta", stack_summary: "media -> heading -> cta" },
      look: { look_summary: "Monochrome editorial overlap hero", confidence: 0.9 },
      craft: {
        imagery_density: "low",
        type_scale: "monumental",
        type_image_mode: "overlap",
        contrast_mode: "monochrome",
        composition_energy: "dynamic",
        chrome_weight: "minimal",
        craft_tags: ["editorial_type", "stats_column", "type_over_image"]
      },
      provenance: { evidence_refs: ["sec_hero"], methods: ["section_look"], layers: ["L2"] }
    },
    {
      reference_id: "ref_estate_features",
      capture_run_id: "cap_estate",
      scope: "section",
      section_id: "sec_features",
      viewport_capture_id: "vpc_estate",
      taxonomy: { category: "feature", taxonomy_ids: ["dig:pattern.feature"], screen_patterns: ["inverted_card"] },
      composition: { signature: "cards>image", stack_summary: "cards -> image" },
      look: { look_summary: "Alternating white and black cards against grayscale render", confidence: 0.85 },
      craft: {
        imagery_density: "low",
        type_scale: "large",
        type_image_mode: "adjacent",
        contrast_mode: "monochrome",
        composition_energy: "balanced",
        chrome_weight: "minimal",
        craft_tags: ["inverted_card", "grayscale_reprise", "low_imagery"]
      },
      provenance: { evidence_refs: ["sec_features"], methods: ["section_look"], layers: ["L2"] }
    }
  ];

  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes("SELECT payload FROM design_references WHERE reference_id = $1")) {
        return { rows: refs.filter((ref) => ref.reference_id === values[0]).map((payload) => ({ payload })) };
      }
      if (sql.includes("SELECT package_path, platform_project_id FROM captures WHERE capture_run_id = $1")) {
        return { rows: [{ package_path: root, platform_project_id: "pp_1" }] };
      }
      return { rows: [] };
    }
  };

  const brief = await assembleCompositionBrief(
    {
      intent: "Minimal monochrome real-estate landing page with large typography and few images.",
      reference_ids: refs.map((ref) => ref.reference_id),
      output_contract: "layout_hints_json"
    },
    client
  );

  assert.equal(brief.role, "design_composition");
  assert.equal(brief.references.length, 2);
  assert.equal(brief.module_blueprint.length, 2);
  assert.ok(brief.craft_constraints.includes("contrast_mode:monochrome"));
  assert.ok(brief.craft_constraints.includes("craft_tag:editorial_type"));
  assert.ok(brief.avoid.includes("glassmorphism / frosted-blur panels"));
  assert.equal(brief.prompt_pack.look_contract?.density, "tight");
  assert.ok(brief.prompt_pack.references.length >= 2);
});
