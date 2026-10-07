import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAssetUrlAllowed,
  brandKitSourceId,
  findBrandKit,
  isHostAllowed,
  loadBrandKitCatalog
} from "../src/brand-kit-allowlist.js";

test("loadBrandKitCatalog exposes pulumi and creativecommons kits", async () => {
  const catalog = await loadBrandKitCatalog();
  assert.ok(catalog.kits.length >= 2);
  const pulumi = findBrandKit(catalog, "pulumi");
  assert.ok(pulumi);
  assert.equal(pulumi?.licenseClass, "connector_tos");
  assert.equal(pulumi?.craftEligibleDefault, false);
  assert.ok((pulumi?.assets.length ?? 0) >= 1);
});

test("isHostAllowed accepts exact and subdomain hosts", () => {
  assert.equal(isHostAllowed("https://brand.pulumi.com/x.png", ["brand.pulumi.com"]), true);
  assert.equal(isHostAllowed("https://cdn.brand.pulumi.com/x.png", ["brand.pulumi.com"]), true);
  assert.equal(isHostAllowed("https://evil.example/x.png", ["brand.pulumi.com"]), false);
});

test("assertAssetUrlAllowed rejects off-list URL even on allowed host", async () => {
  const catalog = await loadBrandKitCatalog();
  const pulumi = findBrandKit(catalog, "pulumi");
  assert.ok(pulumi);
  assert.throws(
    () => assertAssetUrlAllowed(pulumi!, "https://brand.pulumi.com/brand-assets/NOT-IN-LIST.png"),
    /asset_url_not_in_kit/
  );
  assert.doesNotThrow(() => assertAssetUrlAllowed(pulumi!, pulumi!.assets[0]!.url));
});

test("brandKitSourceId is stable per kit+url", () => {
  const a = brandKitSourceId("pulumi", "https://brand.pulumi.com/a.png");
  const b = brandKitSourceId("pulumi", "https://brand.pulumi.com/a.png");
  const c = brandKitSourceId("pulumi", "https://brand.pulumi.com/b.png");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^brandkit_pulumi_/);
});
