import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  graphicIngestIntervention,
  ingestGraphicAssetPackage,
  kindCompositionDefaults
} from "../src/graphic-package.js";
import { verifyCapturePackage } from "../src/verify.js";

test("kindCompositionDefaults differentiate print / social / campaign", () => {
  const print = kindCompositionDefaults("print_ad");
  const social = kindCompositionDefaults("social_post");
  const campaign = kindCompositionDefaults("campaign_keyvisual");
  assert.deepEqual(print.hierarchy, ["brand", "claim", "support", "legal"]);
  assert.ok((print.marginBleed?.bleedRel ?? 0) > 0);
  assert.equal(social.marginBleed?.bleedRel, 0);
  assert.equal(campaign.focal, "claim");
  assert.ok(print.avoid?.some((item) => /web/i.test(item)));
  assert.ok(social.avoid?.some((item) => /landing/i.test(item)));
});

test("ingestGraphicAssetPackage is not a fake desktop web capture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-graphic-pkg-"));
  try {
    const image = await sharp({
      create: { width: 1080, height: 1080, channels: 3, background: { r: 12, g: 24, b: 48 } }
    })
      .png()
      .toBuffer();
    const result = await ingestGraphicAssetPackage({
      image,
      outputDirectory: dir,
      sourceId: "upload_kv",
      filename: "kv.png",
      assetKind: "campaign_keyvisual"
    });
    assert.equal(result.manifest.viewport_captures[0]?.name, "artboard");
    assert.equal(result.manifest.viewport_captures[0]?.viewport.width, 1080);
    assert.equal(result.manifest.viewport_captures[0]?.viewport.height, 1080);
    assert.ok(result.manifest.interventions.includes(graphicIngestIntervention("campaign_keyvisual")));
    assert.equal(result.composition.ctaRole, "absent");
    assert.equal(result.composition.focal, "claim");
    assert.ok(result.composition.avoid.some((item) => /web|hero/i.test(item)));
    assert.equal(result.manifest.browser.version, "graphic-ingest");
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
