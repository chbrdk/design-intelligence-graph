import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ingestUploadedImagePackage } from "../src/image-ingest.js";
import { graphicIngestIntervention } from "../src/graphic-package.js";
import { imageIngestConfig, uploadedImageUrl } from "../src/runtime-paths.js";
import { verifyCapturePackage } from "../src/verify.js";

async function sampleJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 800, height: 1000, channels: 3, background: { r: 40, g: 18, b: 22 } }
  })
    .jpeg()
    .toBuffer();
}

test("default upload without kind uses graphic artboard pipeline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-upload-graphic-"));
  try {
    const image = await sampleJpeg();
    const sourceId = "upload_testhash";
    const result = await ingestUploadedImagePackage({
      image,
      outputDirectory: dir,
      sourceId,
      filename: "campaign.jpg"
    });
    assert.equal(result.manifest.status, "complete");
    assert.equal(result.manifest.viewport_captures.length, 1);
    assert.equal(result.manifest.viewport_captures[0]?.name, "artboard");
    assert.equal(result.manifest.canonical_url, uploadedImageUrl(sourceId));
    assert.ok(result.manifest.interventions.includes(graphicIngestIntervention("other_graphic")));
    assert.ok(result.manifest.run_artifacts.composition_contract);
    assert.ok(!result.manifest.interventions.includes(imageIngestConfig().intervention));
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("print_ad upload writes kind-specific composition_contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-upload-print-"));
  try {
    const image = await sampleJpeg();
    const result = await ingestUploadedImagePackage({
      image,
      outputDirectory: dir,
      sourceId: "upload_print",
      filename: "print.jpg",
      assetKind: "print_ad"
    });
    assert.ok(result.manifest.interventions.includes(graphicIngestIntervention("print_ad")));
    const composition = JSON.parse(
      await readFile(join(result.packageRoot, "derived/composition-contract.json"), "utf8")
    ) as { hierarchy: string[]; avoid: string[]; ctaRole: string };
    assert.deepEqual(composition.hierarchy, ["brand", "claim", "support", "legal"]);
    assert.equal(composition.ctaRole, "absent");
    assert.ok(composition.avoid.some((item) => /bleed|print|web/i.test(item)));
    const asset = JSON.parse(
      await readFile(join(result.packageRoot, "derived/spirion-asset.json"), "utf8")
    ) as { pipeline: string; asset_kind: string };
    assert.equal(asset.pipeline, "graphic");
    assert.equal(asset.asset_kind, "print_ad");
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("web_screen upload keeps legacy desktop viewport path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-upload-web-"));
  try {
    const image = await sharp({
      create: { width: 240, height: 320, channels: 3, background: { r: 40, g: 18, b: 22 } }
    })
      .jpeg()
      .toBuffer();
    const sourceId = "upload_webstill";
    const result = await ingestUploadedImagePackage({
      image,
      outputDirectory: dir,
      sourceId,
      filename: "still.jpg",
      assetKind: "web_screen"
    });
    assert.equal(result.manifest.status, "complete");
    assert.equal(result.manifest.viewport_captures.length, 1);
    assert.notEqual(result.manifest.viewport_captures[0]?.name, "artboard");
    assert.ok(result.manifest.interventions.includes(imageIngestConfig().intervention));
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
