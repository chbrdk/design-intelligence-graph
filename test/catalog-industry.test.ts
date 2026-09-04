import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogHostKey,
  clearCatalogIndustryCache,
  industryTagsForHost
} from "../src/catalog-industry.js";
import { buildDesignFacets } from "../src/design-facets.js";

test("catalog hosts map onto closed industry tags", () => {
  clearCatalogIndustryCache();
  assert.equal(catalogHostKey("https://www.allianz.com/"), "allianz.com");
  assert.deepEqual(industryTagsForHost("https://www.allianz.com/"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://www.nn.nl/"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://www.toyota.com/"), ["automotive"]);
  assert.ok(industryTagsForHost("https://www.apple.com/").includes("tech"));
  assert.deepEqual(industryTagsForHost(null, "www.axa.com"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://www.random-insurtech.example/"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://global.abb/"), ["manufacturing"]);
});

test("award catalog hosts are not blanket-tagged tech", () => {
  clearCatalogIndustryCache();
  // Pure FWA/CSSDA hosts without a vertical alias stay untagged.
  assert.deepEqual(industryTagsForHost("https://sashamartynchuk.com/"), []);
  assert.deepEqual(industryTagsForHost("https://mecha-xyz.webflow.io/"), []);
});

test("vision industry outranks catalog when both present", () => {
  clearCatalogIndustryCache();
  const facets = buildDesignFacets({
    vision_page: {
      page_type: "marketing_agency_landing_page",
      category_tags: ["marketing_agency", "creative"]
    },
    canonical_url: "https://www.allianz.com/",
    site_domain: "allianz.com"
  });
  assert.equal(facets.industry_tags[0], "marketing_agency");
  assert.ok(facets.industry_tags.includes("insurance"));
});
