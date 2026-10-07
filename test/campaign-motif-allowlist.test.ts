import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMotifAssetUrlAllowed,
  campaignMotifSourceId,
  findCampaignMotifPack,
  isHostAllowed,
  loadCampaignMotifCatalog,
  resolveMotifAssetKind
} from "../src/campaign-motif-allowlist.js";

test("loadCampaignMotifCatalog exposes Wikimedia PD packs", async () => {
  const catalog = await loadCampaignMotifCatalog();
  assert.ok(catalog.packs.length >= 2);
  const ww = findCampaignMotifPack(catalog, "wwi_wwii_posters");
  assert.ok(ww);
  assert.equal(ww?.licenseClass, "public_domain");
  assert.equal(ww?.craftEligibleDefault, false);
  assert.equal(ww?.defaultAssetKind, "print_ad");
  assert.ok((ww?.assets.length ?? 0) >= 2);
  assert.ok(ww?.hostAllowlist.includes("upload.wikimedia.org"));
  const political = findCampaignMotifPack(catalog, "midcentury_political_print");
  assert.ok(political);
  assert.ok((political?.assets.length ?? 0) >= 1);
});

test("isHostAllowed accepts Commons upload and thumb hosts", () => {
  assert.equal(
    isHostAllowed("https://upload.wikimedia.org/wikipedia/commons/x.jpg", [
      "upload.wikimedia.org",
      "thumb.wikimedia.org"
    ]),
    true
  );
  assert.equal(
    isHostAllowed(
      "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/x.jpg/1920px-x.jpg",
      ["upload.wikimedia.org", "thumb.wikimedia.org"]
    ),
    true
  );
  assert.equal(
    isHostAllowed("https://evil.example/x.jpg", ["upload.wikimedia.org"]),
    false
  );
});

test("assertMotifAssetUrlAllowed rejects off-list URL", async () => {
  const catalog = await loadCampaignMotifCatalog();
  const pack = findCampaignMotifPack(catalog, "wwi_wwii_posters");
  assert.ok(pack);
  assert.throws(
    () => assertMotifAssetUrlAllowed(pack!, "https://upload.wikimedia.org/wikipedia/commons/NOT-IN-LIST.jpg"),
    /asset_url_not_in_pack/
  );
  assert.doesNotThrow(() => assertMotifAssetUrlAllowed(pack!, pack!.assets[0]!));
});

test("campaignMotifSourceId is stable and resolveMotifAssetKind prefers asset override", async () => {
  const a = campaignMotifSourceId("wwi_wwii_posters", "https://upload.wikimedia.org/a.jpg");
  const b = campaignMotifSourceId("wwi_wwii_posters", "https://upload.wikimedia.org/a.jpg");
  const c = campaignMotifSourceId("wwi_wwii_posters", "https://upload.wikimedia.org/b.jpg");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^motif_wwi_wwii_posters_/);

  const catalog = await loadCampaignMotifCatalog();
  const pack = findCampaignMotifPack(catalog, "wwi_wwii_posters");
  assert.ok(pack);
  const uncle = pack!.assets.find((x) => x.filename.includes("uncle-sam"));
  assert.ok(uncle);
  assert.equal(resolveMotifAssetKind(pack!, uncle!), "campaign_keyvisual");
});
