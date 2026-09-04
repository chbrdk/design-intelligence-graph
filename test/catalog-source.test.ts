import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogSourceScoreBoost,
  catalogSourceTiersForHost,
  clearCatalogSourceCache
} from "../src/catalog-source.js";
import { applyCatalogSourceScoring } from "../src/library-screen-rank.js";

test("catalog source tiers: CSSDA quality, FWA volume, insurance vertical", () => {
  clearCatalogSourceCache();
  assert.equal(catalogSourceTiersForHost("https://mecha-xyz.webflow.io/"), "quality");
  assert.equal(catalogSourceTiersForHost("https://sashamartynchuk.com/"), "volume");
  assert.equal(catalogSourceTiersForHost("https://www.allianz.com/"), "vertical");
  assert.equal(catalogSourceTiersForHost("https://unknown-random.example/"), "unknown");
});

test("quality boost beats volume; industry vertical gets extra boost", () => {
  clearCatalogSourceCache();
  const quality = catalogSourceScoreBoost({ siteDomain: "mecha-xyz.webflow.io" });
  const volume = catalogSourceScoreBoost({ siteDomain: "sashamartynchuk.com" });
  const vertical = catalogSourceScoreBoost({
    siteDomain: "allianz.com",
    industry: "insurance"
  });
  const verticalNoIndustry = catalogSourceScoreBoost({ siteDomain: "allianz.com" });
  assert.ok(quality > volume);
  assert.ok(vertical > verticalNoIndustry);
  assert.ok(vertical > quality);
});

test("applyCatalogSourceScoring lifts quality hosts in screen results", () => {
  clearCatalogSourceCache();
  const screens = [
    {
      capture_run_id: "a",
      site_domain: "sashamartynchuk.com",
      canonical_url: "https://sashamartynchuk.com/",
      score: 0.8,
      design_facets: null
    },
    {
      capture_run_id: "b",
      site_domain: "mecha-xyz.webflow.io",
      canonical_url: "https://mecha-xyz.webflow.io/",
      score: 0.8,
      design_facets: null
    }
  ] as Array<{
    capture_run_id: string;
    site_domain: string;
    canonical_url: string;
    score: number;
    design_facets: null;
    catalog_source?: string;
  }>;
  const ranked = applyCatalogSourceScoring(screens);
  assert.equal(ranked[0]?.capture_run_id, "b");
  assert.equal(ranked[0]?.catalog_source, "quality");
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
});
