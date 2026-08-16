import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  cssBoxToImagePixels,
  emitSectionCrops,
  isCroppableSection,
  padCssBox,
  sectionFrameBox,
  selectSectionsForCrops
} from "../src/section-crops.js";
import type { SectionComposition } from "../src/section-composition.js";
import type { CaptureManifest } from "../src/types.js";

function sampleSection(overrides: Partial<SectionComposition> = {}): SectionComposition {
  return {
    section_id: "sec_hero",
    viewport_capture_id: "vpc_1",
    viewport_name: "desktop",
    root_node_id: "root",
    taxonomy_id: "dig:section.hero_media_above",
    category: "hero",
    confidence: 0.9,
    method: "test",
    recipe: [
      { kind: "role", role: "media", node_id: "m", box: { x: 0, y: 0, width: 1440, height: 700 } },
      { kind: "gap", gap_px: 24 },
      { kind: "role", role: "heading", node_id: "h", box: { x: 100, y: 720, width: 400, height: 48 } }
    ],
    signature: "media>heading",
    text_signals: ["Hello"],
    layer: "L2",
    ...overrides
  };
}

test("sectionFrameBox unions role boxes", () => {
  const frame = sectionFrameBox(sampleSection());
  assert.equal(frame?.x, 0);
  assert.equal(frame?.y, 0);
  assert.equal(frame?.width, 1440);
  assert.equal(frame?.height, 768);
});

test("isCroppableSection rejects page wrappers and tiny nav", () => {
  assert.equal(
    isCroppableSection(
      sampleSection({
        signature: "body",
        category: "content",
        recipe: [{ kind: "role", role: "body", node_id: "b", box: { x: 0, y: 0, width: 390, height: 5600 } }]
      })
    ).ok,
    false
  );
  assert.equal(isCroppableSection(sampleSection()).ok, true);
});

test("cssBoxToImagePixels scales with document vs image size", () => {
  const px = cssBoxToImagePixels(
    { x: 100, y: 200, width: 300, height: 400 },
    { width: 2880, height: 1800 },
    { width: 1440, height: 900 }
  );
  assert.equal(px.left, 200);
  assert.equal(px.top, 400);
  assert.equal(px.width, 600);
  assert.equal(px.height, 800);
});

test("padCssBox respects document bounds", () => {
  const padded = padCssBox({ x: 0, y: 0, width: 100, height: 100 }, 12, { width: 200, height: 150 });
  assert.equal(padded.x, 0);
  assert.equal(padded.y, 0);
  assert.ok(padded.width <= 200);
  assert.ok(padded.height <= 150);
});

test("selectSectionsForCrops prefers croppable look sections", () => {
  const picked = selectSectionsForCrops(
    [
      sampleSection({ section_id: "wrapper", signature: "body", category: "content", recipe: [{ kind: "role", role: "body", node_id: "b", box: { x: 0, y: 0, width: 400, height: 5000 } }] }),
      sampleSection({ section_id: "hero" }),
      sampleSection({
        section_id: "cta",
        category: "conversion",
        signature: "cta",
        recipe: [{ kind: "role", role: "cta", node_id: "c", box: { x: 40, y: 900, width: 200, height: 48 } }]
      })
    ],
    4
  );
  assert.ok(picked.some((section) => section.section_id === "hero"));
  assert.ok(!picked.some((section) => section.section_id === "wrapper"));
});

test("emitSectionCrops writes webp crops and index json", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-crops-"));
  const shotDir = join(root, "viewports/desktop/screenshots");
  await mkdir(shotDir, { recursive: true });
  const png = await sharp({
    create: { width: 800, height: 1200, channels: 3, background: { r: 20, g: 20, b: 30 } }
  })
    .png()
    .toBuffer();
  await writeFile(join(shotDir, "full-page.png"), png);

  const manifest = {
    viewport_captures: [
      {
        name: "desktop",
        viewport_capture_id: "vpc_1",
        document: { width: 800, height: 1200 },
        viewport: { width: 800, height: 900, device_scale_factor: 1 },
        artifacts: {
          full_page_screenshot: { path: "viewports/desktop/screenshots/full-page.png", sha256: "x", bytes: png.length, media_type: "image/png" }
        }
      }
    ]
  } as unknown as CaptureManifest;

  const result = await emitSectionCrops({
    packageRoot: root,
    viewportCaptures: manifest.viewport_captures,
    sections: [
      sampleSection({
        section_id: "sec_band",
        recipe: [{ kind: "role", role: "media", node_id: "m", box: { x: 0, y: 100, width: 800, height: 400 } }],
        signature: "media"
      })
    ],
    viewportName: "desktop"
  });

  assert.ok(result.crops.length >= 1);
  assert.equal(result.document.crops[0]?.path.endsWith(".webp"), true);
  assert.match(result.artifact.path, /section-crops\.json$/);
});
