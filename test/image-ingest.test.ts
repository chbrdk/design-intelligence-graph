import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ingestUploadedImagePackage } from "../src/image-ingest.js";
import { imageIngestConfig, uploadedImageUrl } from "../src/runtime-paths.js";
import { verifyCapturePackage } from "../src/verify.js";

test("uploaded still image ingest writes a verifiable desktop capture package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-upload-pkg-"));
  try {
    const image = await sharp({
      create: { width: 240, height: 320, channels: 3, background: { r: 40, g: 18, b: 22 } }
    })
      .jpeg()
      .toBuffer();
    const sourceId = "upload_testhash";
    const result = await ingestUploadedImagePackage({
      image,
      outputDirectory: dir,
      sourceId,
      filename: "mood.jpg"
    });
    assert.equal(result.manifest.status, "complete");
    assert.equal(result.manifest.viewport_captures.length, 1);
    assert.equal(result.manifest.canonical_url, uploadedImageUrl(sourceId));
    assert.ok(result.manifest.interventions.includes(imageIngestConfig().intervention));
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
