import assert from "node:assert/strict";
import test from "node:test";
import {
  explicitScreenFacetFilter,
  inferScreenSearchFacetsFromQuery,
  mergeScreenSearchFacets,
  preferSoftFacetMatches,
  softFacetMatchBoost,
  softScreenFacetFilter
} from "../src/screen-search-intent.js";
import { resolveScreenSearchIntent } from "../src/library-screen-rank.js";

test("inferScreenSearchFacetsFromQuery maps minimal monochrome DE/EN", () => {
  const en = inferScreenSearchFacetsFromQuery("minimal monochrome");
  assert.equal(en.style, "minimal");
  assert.equal(en.contrast_mode, "monochrome");
  assert.equal(en.palette, "mono");
  assert.ok(en.inferred.includes("style:minimal"));
  assert.ok(en.inferred.includes("contrast_mode:monochrome"));

  const de = inferScreenSearchFacetsFromQuery("minimalistisch monochrom dunkle UI");
  assert.equal(de.style, "minimal");
  assert.equal(de.contrast_mode, "monochrome");
  assert.equal(de.value_key, "dark");
  assert.equal(de.palette, "mono");
});

test("explicit facet params win over inference", () => {
  const inferred = inferScreenSearchFacetsFromQuery("minimal monochrome");
  const merged = mergeScreenSearchFacets({ style: "editorial", contrast_mode: "saturated" }, inferred);
  assert.equal(merged.style, "editorial");
  assert.equal(merged.contrast_mode, "saturated");
  assert.equal(merged.palette, "mono");
});

test("soft vs hard facet split for screen search intent", () => {
  const intent = resolveScreenSearchIntent("minimal monochrome", { industry: "insurance" });
  assert.equal(intent.hard.industry, "insurance");
  assert.equal(intent.hard.style, undefined);
  assert.equal(intent.soft.style, "minimal");
  assert.equal(intent.soft.contrast_mode, "monochrome");
  assert.equal(intent.soft.palette, "mono");
  assert.deepEqual(explicitScreenFacetFilter({ industry: "insurance" }), { industry: "insurance" });
  assert.equal(softScreenFacetFilter({ industry: "insurance" }, { industry: "insurance", style: "minimal" }).style, "minimal");
});

test("inferScreenSearchFacetsFromQuery maps login screen pattern", () => {
  const hit = inferScreenSearchFacetsFromQuery("login screen fintech");
  assert.equal(hit.screen_pattern, "Login");
  assert.ok(hit.inferred.includes("screen_pattern:Login"));
});

test("preferSoftFacetMatches keeps pool when too few matches", () => {
  const soft = { style: "minimal", contrast_mode: "monochrome" };
  const screens = [
    { capture_run_id: "a", design_facets: { style: "minimal", contrast_mode: "monochrome", industry_tags: [] } },
    { capture_run_id: "b", design_facets: { style: "editorial", contrast_mode: "saturated", industry_tags: [] } },
    { capture_run_id: "c", design_facets: { style: "minimal", contrast_mode: "mixed", industry_tags: [] } }
  ];
  assert.equal(preferSoftFacetMatches(screens, soft, 2).length, 3);
  assert.equal(preferSoftFacetMatches(screens, soft, 1).length, 1);
  assert.ok(softFacetMatchBoost(screens[0]!.design_facets, soft) > softFacetMatchBoost(screens[1]!.design_facets, soft));
});
