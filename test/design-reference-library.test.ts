import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCollectionScopeAllowed,
  searchDesignReferences
} from "../src/design-reference-library.js";
import { listDigTools, callDigTool } from "../src/mcp-api.js";
import type { KnowledgeGraph } from "../src/storage.js";

test("listDigTools includes dig_reference_* Wave 2 tools", () => {
  const names = listDigTools().map((t) => t.name);
  assert.ok(names.includes("dig_reference_search"));
  assert.ok(names.includes("dig_reference_get"));
  assert.ok(names.includes("dig_reference_pack"));
  assert.ok(names.includes("dig_reference_prompt_pack"));
  assert.ok(names.includes("dig_compose_brief"));
  assert.ok(names.includes("dig_generate"));
  assert.ok(names.includes("dig_screen_search"));
  assert.ok(names.includes("dig_capture_prompt_pack"));
  const search = listDigTools().find((t) => t.name === "dig_reference_search");
  const props = search?.inputSchema.properties as Record<string, unknown>;
  assert.ok(props && "similar_to" in props);
  assert.ok("style" in props && "layout" in props && "industry" in props);
  assert.ok("craft_tags" in props && "imagery_density" in props && "type_scale" in props);
});

test("assertCollectionScopeAllowed requires platformProjectId in live mode", () => {
  const prev = process.env.DIG_FEDERATION_MODE;
  process.env.DIG_FEDERATION_MODE = "live";
  assert.throws(() => assertCollectionScopeAllowed(null), /platformProjectId required/);
  assert.doesNotThrow(() => assertCollectionScopeAllowed("pp-1"));
  if (prev === undefined) delete process.env.DIG_FEDERATION_MODE;
  else process.env.DIG_FEDERATION_MODE = prev;
});

test("assertCollectionScopeAllowed allows missing scope in dummy mode", () => {
  const prev = process.env.DIG_FEDERATION_MODE;
  process.env.DIG_FEDERATION_MODE = "dummy";
  assert.doesNotThrow(() => assertCollectionScopeAllowed(null));
  if (prev === undefined) delete process.env.DIG_FEDERATION_MODE;
  else process.env.DIG_FEDERATION_MODE = prev;
});

test("callDigTool rejects dig_reference_* (async path)", () => {
  const graph: KnowledgeGraph = {
    schema_version: "0.1.0",
    storage_model_version: "0.1.0",
    source_capture_run_id: "run_test",
    indexed_at: "2026-01-01T00:00:00Z",
    nodes: [],
    edges: [],
    lineage: []
  };
  assert.throws(
    () => callDigTool(graph, "dig_reference_search", { query: "hero" }),
    /callDigReferenceTool/
  );
  assert.throws(
    () => callDigTool(graph, "dig_screen_search", { style: "high-energy" }),
    /callDigLibraryTool/
  );
});

test("searchDesignReferences filters by craft tags and screen facets", async () => {
  async function writeVisionPage(
    root: string,
    page: { atmosphere: string; layout: string; tags: string[]; pageType: string; editorial?: boolean }
  ) {
    await mkdir(join(root, "derived"), { recursive: true });
    await writeFile(
      join(root, "derived/vision-page.json"),
      JSON.stringify({
        schema_version: "0.1.0",
        vision_page_version: "0.2.0",
        generated_at: new Date().toISOString(),
        source_screenshot: "viewports/desktop/screenshots/full-page.webp",
        page_type: page.pageType,
        overall_atmosphere: page.atmosphere,
        color_mood: page.editorial ? "monochrome slate" : "bright accent",
        typography_feel: page.editorial ? "bold editorial" : "playful sans",
        above_the_fold: "hero",
        vertical_rhythm: page.layout,
        layout_system: page.layout,
        media_strategy: page.editorial ? "single architectural render with grayscale reprise" : "gallery",
        notable_modules: page.editorial ? ["stats_column"] : ["gallery"],
        brand_cues: "",
        interaction_chrome: page.editorial ? "tiny nav and simple icons" : "dense controls",
        visual_craft: page.editorial
          ? {
              type_image_relationship: "headline overlap over architecture render",
              typography_composition: "massive display caps with tiny tracked body copy",
              imagery_craft: "single architectural render with grayscale reprise",
              spatial_craft: "asymmetric hero",
              chrome_vs_content: "minimal chrome versus massive editorial type",
              rebuild_spec: ""
            }
          : {
              type_image_relationship: "separate image cards",
              typography_composition: "small labels",
              imagery_craft: "many bright photos",
              spatial_craft: "grid",
              chrome_vs_content: "interface heavy",
              rebuild_spec: ""
            },
        category_tags: page.tags,
        status: "complete"
      }),
      "utf8"
    );
  }

  const estateRoot = await mkdtemp(join(tmpdir(), "dig-ref-estate-"));
  const retailRoot = await mkdtemp(join(tmpdir(), "dig-ref-retail-"));
  await writeVisionPage(estateRoot, {
    atmosphere: "minimal editorial",
    layout: "mixed",
    tags: ["real_estate"],
    pageType: "real_estate_platform_landing_page",
    editorial: true
  });
  await writeVisionPage(retailRoot, {
    atmosphere: "playful",
    layout: "card grid",
    tags: ["ecommerce"],
    pageType: "ecommerce_home",
    editorial: false
  });

  const rows = {
    screens: [
      {
        capture_run_id: "cap_estate",
        viewport_capture_id: "vpc_estate",
        name: "desktop",
        title: "Estate",
        site_domain: "estate.example",
        canonical_url: "https://estate.example/",
        package_path: estateRoot
      },
      {
        capture_run_id: "cap_retail",
        viewport_capture_id: "vpc_retail",
        name: "desktop",
        title: "Retail",
        site_domain: "retail.example",
        canonical_url: "https://retail.example/",
        package_path: retailRoot
      }
    ],
    refs: [
      {
        payload: {
          reference_id: "ref_estate_hero",
          capture_run_id: "cap_estate",
          scope: "section",
          section_id: "sec_hero",
          viewport_capture_id: "vpc_estate",
          taxonomy: { category: "hero", taxonomy_ids: ["dig:pattern.hero"], screen_patterns: ["stats_column"] },
          composition: { signature: "media>heading>cta", stack_summary: "media -> heading -> cta" },
          look: { look_summary: "Monochrome editorial hero with overlap and grayscale reprise", confidence: 0.9 },
          craft: {
            imagery_density: "low",
            type_scale: "monumental",
            type_image_mode: "overlap",
            contrast_mode: "monochrome",
            composition_energy: "dynamic",
            chrome_weight: "minimal",
            craft_tags: ["editorial_type", "stats_column", "low_imagery", "type_over_image"]
          },
          provenance: { evidence_refs: ["sec_hero"], methods: ["section_look"], layers: ["L2"] }
        }
      },
      {
        payload: {
          reference_id: "ref_retail_grid",
          capture_run_id: "cap_retail",
          scope: "section",
          section_id: "sec_grid",
          viewport_capture_id: "vpc_retail",
          taxonomy: { category: "feature", taxonomy_ids: ["dig:pattern.feature"], screen_patterns: ["gallery"] },
          composition: { signature: "grid>cards", stack_summary: "grid -> cards" },
          look: { look_summary: "Bright gallery card grid", confidence: 0.8 },
          craft: {
            imagery_density: "high",
            type_scale: "small",
            type_image_mode: "separate",
            contrast_mode: "saturated",
            composition_energy: "balanced",
            chrome_weight: "interface_heavy",
            craft_tags: ["gallery"]
          },
          provenance: { evidence_refs: ["sec_grid"], methods: ["section_look"], layers: ["L2"] }
        }
      }
    ]
  };

  const client = {
    async query(sql: string) {
      if (sql.includes("FROM viewports v")) return { rows: rows.screens };
      if (sql.includes("SELECT payload FROM design_references")) return { rows: rows.refs };
      return { rows: [] };
    }
  };

  const refs = await searchDesignReferences(
    {
      industry: "real_estate",
      craft_tags: ["editorial_type", "stats_column"],
      imagery_density: "low",
      contrast_mode: "monochrome"
    },
    client
  );
  assert.deepEqual(refs.map((ref) => ref.reference_id), ["ref_estate_hero"]);
});
