import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import sharp from "sharp";
import { imageIngestConfig } from "../src/runtime-paths.js";
import {
  parseMultipartImageUploads,
  resolveUploadMime,
  sanitizeUploadFilename
} from "../src/image-upload.js";

test("sanitizeUploadFilename strips paths and unsafe characters", () => {
  assert.equal(sanitizeUploadFilename("../../secret.png"), "secret.png");
  assert.equal(sanitizeUploadFilename("mood board 1.JPG"), "mood_board_1.JPG");
});

test("resolveUploadMime allows configured types and filename fallback", () => {
  assert.equal(resolveUploadMime("hero.png", "image/png"), "image/png");
  assert.equal(resolveUploadMime("hero.jpg", "application/octet-stream"), "image/jpeg");
  assert.equal(resolveUploadMime("hero.txt", "text/plain"), null);
});

test("parseMultipartImageUploads stores allowed images and skips the rest", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-upload-root-"));
  try {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 12, g: 24, b: 36 } }
    })
      .png()
      .toBuffer();
    const boundary = "----digUploadBoundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="hero.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      png,
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--${boundary}\r\nContent-Disposition: form-data; name="platformProjectId"\r\n\r\ncol_1\r\n--${boundary}--\r\n`
      )
    ]);
    const request = Readable.from(body) as IncomingMessage;
    request.headers = { "content-type": `multipart/form-data; boundary=${boundary}` };
    const parsed = await parseMultipartImageUploads(request, root);
    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.files[0]?.filename, "hero.png");
    assert.equal(parsed.platformProjectId, "col_1");
    assert.ok(parsed.skipped.some((item) => item.reason === "unsupported_type"));
    const stored = await readFile(parsed.files[0]!.path);
    assert.deepEqual(stored, png);
    assert.equal(imageIngestConfig().fieldName, "files");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
