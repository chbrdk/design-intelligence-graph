import assert from "node:assert/strict";
import test from "node:test";
import { zipSync } from "fflate";
import {
  assertAssetUrlAllowed,
  assertSafeZipMember,
  brandKitSourceId,
  extractZipMember,
  findBrandKit,
  isHostAllowed,
  loadBrandKitCatalog
} from "../src/brand-kit-allowlist.js";

test("loadBrandKitCatalog exposes core kits including vercel and github", async () => {
  const catalog = await loadBrandKitCatalog();
  assert.ok(catalog.kits.length >= 10);
  const pulumi = findBrandKit(catalog, "pulumi");
  assert.ok(pulumi);
  assert.equal(pulumi?.licenseClass, "connector_tos");
  assert.equal(pulumi?.craftEligibleDefault, false);
  assert.ok((pulumi?.assets.length ?? 0) >= 1);
  const venice = findBrandKit(catalog, "venice");
  assert.ok(venice);
  assert.ok(venice?.assets.some((a) => a.zipMember));
  assert.ok(findBrandKit(catalog, "vercel")?.assets.some((a) => a.zipMember));
  assert.ok(findBrandKit(catalog, "github"));
  assert.ok(findBrandKit(catalog, "tailwind"));
  assert.ok(findBrandKit(catalog, "astro"));
  assert.ok(findBrandKit(catalog, "python"));
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
  assert.doesNotThrow(() => assertAssetUrlAllowed(pulumi!, pulumi!.assets[0]!));
});

test("zipMember required for zip URLs and path traversal rejected", async () => {
  const catalog = await loadBrandKitCatalog();
  const venice = findBrandKit(catalog, "venice");
  assert.ok(venice);
  const zipAsset = venice!.assets.find((a) => a.zipMember);
  assert.ok(zipAsset);
  assert.doesNotThrow(() => assertAssetUrlAllowed(venice!, zipAsset!));
  assert.throws(
    () => assertAssetUrlAllowed(venice!, { url: zipAsset!.url, filename: "x.png" }),
    /zip_member_required|asset_url_not_in_kit/
  );
  assert.throws(() => assertSafeZipMember("../evil.png"), /zip_member_unsafe/);
  assert.throws(() => assertSafeZipMember("/abs.png"), /zip_member_unsafe/);
});

test("extractZipMember pulls only the allowlisted member", () => {
  // Minimal valid PNG header bytes (>32) so empty check passes.
  const png = Buffer.alloc(64, 0);
  png.write("\x89PNG\r\n\x1a\n", 0);
  const zipped = Buffer.from(
    zipSync({
      "Kit/good.png": new Uint8Array(png),
      "Kit/other.png": new Uint8Array(png)
    })
  );
  const extracted = extractZipMember(zipped, "Kit/good.png");
  assert.equal(extracted.contentType, "image/png");
  assert.equal(extracted.buffer.byteLength, 64);
  assert.throws(() => extractZipMember(zipped, "Kit/missing.png"), /zip_member_not_found/);
});

test("brandKitSourceId is stable per kit+url(+zipMember)", () => {
  const a = brandKitSourceId("pulumi", "https://brand.pulumi.com/a.png");
  const b = brandKitSourceId("pulumi", "https://brand.pulumi.com/a.png");
  const c = brandKitSourceId("pulumi", "https://brand.pulumi.com/b.png");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^brandkit_pulumi_/);
  const z1 = brandKitSourceId("venice", "https://cdn.venice.ai/brand/x.zip", "a.png");
  const z2 = brandKitSourceId("venice", "https://cdn.venice.ai/brand/x.zip", "b.png");
  assert.notEqual(z1, z2);
});
