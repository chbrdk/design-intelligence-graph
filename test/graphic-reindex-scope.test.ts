import assert from "node:assert/strict";
import test from "node:test";
import {
  graphicReindexScopeFromAssetRaw,
  resolveConnectorSource
} from "../src/graphic-reindex-scope.js";

test("resolveConnectorSource maps brandkit_, motif_, and dribbble_ prefixes", () => {
  assert.deepEqual(resolveConnectorSource("brandkit_pulumi_abc"), {
    source: "connector:brand_kit",
    isConnector: true
  });
  assert.deepEqual(resolveConnectorSource("motif_wwi_wwii_posters_abc"), {
    source: "connector:campaign_motif",
    isConnector: true
  });
  assert.deepEqual(resolveConnectorSource("dribbble_123"), {
    source: "connector:dribbble",
    isConnector: true
  });
  assert.deepEqual(resolveConnectorSource("local-file", "upload"), {
    source: "upload",
    isConnector: false
  });
});

test("graphicReindexScopeFromAssetRaw keeps brand kits craftEligible false", () => {
  const scope = graphicReindexScopeFromAssetRaw({
    asset_kind: "brand_system",
    source: "upload",
    source_id: "brandkit_tailwind_abc",
    tags: ["kind:brand_system"]
  });
  assert.equal(scope.source, "connector:brand_kit");
  assert.equal(scope.licenseClass, "connector_tos");
  assert.equal(scope.craftEligible, false);
  assert.equal(scope.assetKind, "brand_system");
});

test("graphicReindexScopeFromAssetRaw allows customer uploads craftEligible true", () => {
  const scope = graphicReindexScopeFromAssetRaw({
    asset_kind: "campaign_keyvisual",
    source: "upload",
    source_id: "studio_shot_1"
  });
  assert.equal(scope.source, "upload");
  assert.equal(scope.licenseClass, "customer_owned");
  assert.equal(scope.craftEligible, true);
});

test("graphicReindexScopeFromAssetRaw keeps campaign motifs public_domain craftEligible false", () => {
  const scope = graphicReindexScopeFromAssetRaw({
    asset_kind: "print_ad",
    source: "upload",
    source_id: "motif_wwi_wwii_posters_abc",
    tags: ["kind:print_ad"]
  });
  assert.equal(scope.source, "connector:campaign_motif");
  assert.equal(scope.licenseClass, "public_domain");
  assert.equal(scope.craftEligible, false);
  assert.equal(scope.assetKind, "print_ad");
});
