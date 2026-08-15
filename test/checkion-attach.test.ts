import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyCheckionScreenshotToPackage } from "../src/checkion-attach.js";
import { jpegDimensions } from "../src/checkion-client.js";

/** Minimal valid JPEG (1×1) with SOF0. */
function tinyJpeg(width = 8, height = 12): Buffer {
  // JFIF stub with SOF0 dimensions — enough for jpegDimensions parser
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x11, 0x00
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary"),
    sof,
    Buffer.from([0xff, 0xd9])
  ]);
}

test("jpegDimensions reads SOF0 width/height", () => {
  const dims = jpegDimensions(tinyJpeg(1920, 4321));
  assert.deepEqual(dims, { width: 1920, height: 4321 });
});

test("applyCheckionScreenshotToPackage replaces desktop full_page", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-checkion-"));
  await mkdir(join(root, "viewports/desktop/screenshots"), { recursive: true });
  const manifest = {
    schema_version: "0.1.0",
    capture_run_id: "cap_test",
    run_artifacts: {},
    viewport_captures: [
      {
        name: "desktop",
        document: { width: 1440, height: 1000 },
        artifacts: {
          full_page_screenshot: {
            path: "viewports/desktop/screenshots/full-page.webp",
            sha256: "sha256:x",
            bytes: 1,
            media_type: "image/webp"
          }
        }
      }
    ]
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));

  const jpeg = tinyJpeg(1920, 3500);
  const result = await applyCheckionScreenshotToPackage(root, {
    scanId: "scan_abc",
    projectId: "proj_dig",
    bytes: jpeg,
    contentType: "image/jpeg",
    width: 1920,
    height: 3500
  });

  assert.equal(result.attached, true);
  assert.match(result.path ?? "", /checkion-full-page\.jpg$/);
  const updated = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
    run_artifacts: Record<string, unknown>;
    viewport_captures: Array<{
      name: string;
      document: { width: number; height: number };
      artifacts: Record<string, { path: string; media_type: string }>;
    }>;
  };
  const desktop = updated.viewport_captures[0]!;
  const full = desktop.artifacts.full_page_screenshot;
  assert.ok(full);
  assert.equal(full.path, "viewports/desktop/screenshots/checkion-full-page.jpg");
  assert.equal(full.media_type, "image/jpeg");
  assert.deepEqual(desktop.document, { width: 1920, height: 3500 });
  assert.ok(updated.run_artifacts.checkion_screenshot);
});

test("attach soft-fails by default when CHECKION API returns HTML", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-checkion-soft-"));
  await mkdir(join(root, "viewports/desktop/screenshots"), { recursive: true });
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      capture_run_id: "cap_soft",
      run_artifacts: {},
      viewport_captures: [{ name: "desktop", artifacts: {} }]
    })
  );
  const { attachCheckionScreenshotIfConfigured } = await import("../src/checkion-attach.js");
  const result = await attachCheckionScreenshotIfConfigured(
    root,
    "https://msqdx.com/",
    {
      baseUrl: "https://example.com",
      token: "checkion_test",
      projectId: "proj_test",
      pollIntervalMs: 100,
      pollTimeoutMs: 500,
      required: true
    },
    process.cwd(),
    { DIG_CHECKION_STRICT: "0" }
  );
  assert.equal(result.attached, false);
  assert.ok(result.skipped);
});
