import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  asCompositionContract,
  aspectRatioLabel,
  enrichGraphicFromImage,
  guessLayoutFamily
} from "../src/composition-contract.js";
import {
  craftEligibleFromLicense,
  normalizeAssetKind,
  resolvePackOutputContract,
  wantsComposition
} from "../src/spirion-asset.js";

test("normalizeAssetKind defaults and aliases", () => {
  assert.equal(normalizeAssetKind(undefined), "web_screen");
  assert.equal(normalizeAssetKind("keyvisual"), "campaign_keyvisual");
  assert.equal(normalizeAssetKind("social_post"), "social_post");
});

test("craftEligibleFromLicense blocks unknown and connector_tos by default", () => {
  assert.equal(craftEligibleFromLicense("unknown"), false);
  assert.equal(craftEligibleFromLicense("connector_tos"), false);
  assert.equal(craftEligibleFromLicense("customer_owned"), true);
  assert.equal(craftEligibleFromLicense("connector_tos", true), true);
});

test("resolvePackOutputContract auto derives from assetKind", () => {
  assert.equal(resolvePackOutputContract("auto", "web_screen"), "both");
  assert.equal(resolvePackOutputContract("auto", "campaign_keyvisual"), "graphic");
  assert.equal(resolvePackOutputContract("graphic", "web_screen"), "graphic");
  assert.ok(wantsComposition("graphic"));
});

test("aspectRatioLabel and layoutFamily guesses", () => {
  assert.equal(aspectRatioLabel(1080, 1080), "1:1");
  assert.equal(aspectRatioLabel(1920, 1080), "16:9");
  assert.equal(guessLayoutFamily("1:1", 1080, 1080), "centered-lockup");
});

test("enrichGraphicFromImage writes valid composition_contract", async () => {
  const png = await sharp({
    create: { width: 800, height: 800, channels: 3, background: { r: 20, g: 40, b: 60 } }
  })
    .png()
    .toBuffer();
  const result = await enrichGraphicFromImage(png);
  const contract = asCompositionContract(result.composition_contract);
  assert.ok(contract);
  assert.ok(contract!.avoid.length >= 1);
  assert.ok(contract!.hierarchy.length >= 1);
  assert.equal(result.format.aspectRatio, "1:1");
  assert.equal(result.thin, false);
  assert.match(result.content_hash, /^[a-f0-9]{64}$/);
});
