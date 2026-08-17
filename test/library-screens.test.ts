import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mcpLibraryToolNames } from "../src/runtime-paths.js";
import {
  captureRunIdsForScreenFacets,
  hasScreenFacetFilters,
  listLibraryScreens,
  publicLibraryScreenHit
} from "../src/library-screens.js";
import { listDigTools } from "../src/mcp-api.js";

test("mcpLibraryToolNames match listDigTools and paths.json", () => {
  const names = mcpLibraryToolNames();
  const listed = listDigTools().map((tool) => tool.name);
  assert.equal(names.screenSearch, "dig_screen_search");
  assert.equal(names.capturePromptPack, "dig_capture_prompt_pack");
  assert.ok(listed.includes(names.screenSearch));
  assert.ok(listed.includes(names.capturePromptPack));
  const search = listDigTools().find((tool) => tool.name === names.screenSearch);
  const props = search?.inputSchema.properties as Record<string, unknown>;
  assert.ok(props && "style" in props && "layout" in props && "industry" in props);
});

test("hasScreenFacetFilters ignores empty and unknown values", () => {
  assert.equal(hasScreenFacetFilters({}), false);
  assert.equal(hasScreenFacetFilters({ style: "not-a-style" }), false);
  assert.equal(hasScreenFacetFilters({ style: "high-energy" }), true);
  assert.equal(hasScreenFacetFilters({ layout: "card grid" }), true);
  assert.equal(hasScreenFacetFilters({ industry: "finance" }), true);
});

test("captureRunIdsForScreenFacets skips SQL when no facets", async () => {
  const client = {
    async query() {
      throw new Error("should_not_query");
    }
  };
  assert.equal(await captureRunIdsForScreenFacets(client, {}), null);
});

test("listLibraryScreens scopes platformProjectId in SQL", async () => {
  let sql = "";
  let values: unknown[] = [];
  const client = {
    async query(q: string, v: unknown[] = []) {
      sql = q;
      values = v;
      return { rows: [] };
    }
  };
  await listLibraryScreens(client, { platformProjectId: "pp_1" });
  assert.match(sql, /c\.platform_project_id = \$1/);
  assert.equal(values[0], "pp_1");
});

test("publicLibraryScreenHit omits package_path", () => {
  const hit = publicLibraryScreenHit({
    capture_run_id: "cap_1",
    viewport_capture_id: "vpc_1",
    name: "desktop",
    title: "Home",
    site_domain: "example.com",
    canonical_url: "https://example.com/",
    package_path: "/secret/pkg",
    design_facets: {
      page_type: "home",
      style: "high-energy",
      layout: "full-bleed stacks",
      industry_tags: ["media"]
    }
  });
  assert.equal(hit.capture_run_id, "cap_1");
  assert.equal("package_path" in hit, false);
});

test("listLibraryScreens filters by style/layout and capture ids", async () => {
  async function writeVisionPage(
    root: string,
    page: { atmosphere: string; layout: string; tags: string[]; pageType: string }
  ) {
    await mkdir(join(root, "derived"), { recursive: true });
    await writeFile(
      join(root, "derived/vision-page.json"),
      JSON.stringify({
        schema_version: "0.1.0",
        vision_page_version: "0.1.0",
        generated_at: new Date().toISOString(),
        source_screenshot: "viewports/desktop/screenshots/full-page.webp",
        page_type: page.pageType,
        overall_atmosphere: page.atmosphere,
        color_mood: "dark",
        typography_feel: "sans",
        above_the_fold: "hero",
        vertical_rhythm: page.layout,
        layout_system: page.layout,
        media_strategy: "photo",
        notable_modules: [],
        brand_cues: "",
        interaction_chrome: "",
        category_tags: page.tags,
        status: "complete"
      }),
      "utf8"
    );
  }

  const energyRoot = await mkdtemp(join(tmpdir(), "dig-lib-energy-"));
  const gridRoot = await mkdtemp(join(tmpdir(), "dig-lib-grid-"));
  await writeVisionPage(energyRoot, {
    atmosphere: "high-energy_corporate",
    layout: "full-bleed stacks",
    tags: ["media"],
    pageType: "marketing_agency_landing_page"
  });
  await writeVisionPage(gridRoot, {
    atmosphere: "minimal",
    layout: "card grid",
    tags: ["finance"],
    pageType: "finance_home"
  });

  const rows = [
    {
      capture_run_id: "cap_energy",
      viewport_capture_id: "vpc_energy",
      name: "desktop",
      title: "Energy",
      site_domain: "energy.example",
      canonical_url: "https://energy.example/",
      package_path: energyRoot
    },
    {
      capture_run_id: "cap_grid",
      viewport_capture_id: "vpc_grid",
      name: "desktop",
      title: "Grid",
      site_domain: "grid.example",
      canonical_url: "https://grid.example/",
      package_path: gridRoot
    }
  ];
  const client = {
    async query() {
      return { rows };
    }
  };

  const listed = await listLibraryScreens(client, {
    style: "high-energy",
    layout: "full-bleed stacks"
  });
  assert.deepEqual(
    listed.map((row) => row.capture_run_id),
    ["cap_energy"]
  );
  assert.equal("package_path" in publicLibraryScreenHit(listed[0]!), false);

  const ids = await captureRunIdsForScreenFacets(client, { industry: "finance" });
  assert.deepEqual(ids, ["cap_grid"]);

  const empty = await captureRunIdsForScreenFacets(client, { industry: "healthcare" });
  assert.deepEqual(empty, []);
});
