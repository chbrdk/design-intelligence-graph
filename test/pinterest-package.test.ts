import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ingestPinterestPinPackage } from "../src/pinterest-package.js";
import { verifyCapturePackage } from "../src/verify.js";

test("Pinterest pin ingest writes a verifiable desktop capture package", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-pinterest-"));
  try {
    const image = await sharp({
      create: { width: 320, height: 480, channels: 3, background: { r: 18, g: 32, b: 48 } }
    })
      .png()
      .toBuffer();
    const result = await ingestPinterestPinPackage({
      pin: {
        id: "555",
        title: "Editorial hero",
        description: "",
        link: null,
        board_id: "board_1",
        image: { url: "https://i.pinimg.com/originals/demo.png", width: 320, height: 480 }
      },
      image,
      outputDirectory: dir,
      boardId: "board_1"
    });
    assert.equal(result.manifest.status, "complete");
    assert.equal(result.manifest.viewport_captures.length, 1);
    assert.equal(result.manifest.viewport_captures[0]?.name, "desktop");
    assert.match(result.manifest.canonical_url, /\/pin\/555\//);
    assert.ok(result.manifest.interventions.includes("pinterest_oauth_board_import"));
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, verification.issues.map((issue) => issue.code).join(", "));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
