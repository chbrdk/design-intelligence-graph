import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  buildVisionLayoutTiles,
  mapBandsFromTile,
  mergeVisionLayoutBands,
  normalizeVisionBox,
  parseVisionLayoutResponse,
  shouldPreferVisionLooks,
  visionBandsToSectionLooks
} from "../src/vision-layout.js";
import type { SectionLookDescription } from "../src/section-look.js";

test("normalizeVisionBox forces full-width bands and rejects tiny heights", () => {
  assert.equal(normalizeVisionBox({ x: 0, y: 0, width: 1, height: 0.02 }), null);
  assert.equal(normalizeVisionBox({ x: 0, y: 0, width: 1, height: 0.04 }), null);
  const box = normalizeVisionBox({ x: 0.2, y: 0.2, width: 0.4, height: 0.3 });
  assert.ok(box);
  assert.equal(box.x, 0);
  assert.equal(box.width, 1);
  assert.equal(box.y, 0.2);
});

test("parseVisionLayoutResponse enforces single hero and skips consent labels", () => {
  const raw = JSON.stringify({
    bands: [
      {
        id: "h1",
        label: "Hero",
        category: "hero",
        box: { x: 0, y: 0, width: 1, height: 0.2 },
        confidence: 0.9
      },
      {
        id: "h2",
        label: "Also hero",
        category: "hero",
        box: { x: 0, y: 0.25, width: 1, height: 0.2 },
        confidence: 0.8
      },
      {
        id: "cmp",
        label: "Accept all cookies",
        category: "content",
        box: { x: 0.2, y: 0.4, width: 0.6, height: 0.2 },
        confidence: 0.7
      },
      {
        id: "grid",
        label: "Model grid",
        category: "feature",
        box: { x: 0, y: 0.5, width: 1, height: 0.25 },
        confidence: 0.85
      }
    ],
    notes: "Tall marketing page"
  });
  const parsed = parseVisionLayoutResponse(raw, { maxBands: 12 });
  assert.equal(parsed.bands.filter((band) => band.category === "hero").length, 1);
  assert.ok(!parsed.bands.some((band) => /cookie/i.test(band.label)));
  assert.ok(parsed.bands.some((band) => band.id === "grid"));
  assert.equal(parsed.notes, "Tall marketing page");
});

test("mapBandsFromTile remaps tile-local y onto full page", () => {
  const mapped = mapBandsFromTile(
    [
      {
        id: "a",
        label: "Mid",
        category: "content",
        box: { x: 0, y: 0.5, width: 1, height: 0.25 },
        confidence: 0.7
      }
    ],
    { top: 1000, height: 1000, fullHeight: 3000 },
    "tile_2"
  );
  assert.equal(mapped.length, 1);
  // absTop = 1000 + 0.5*1000 = 1500 → y = 0.5
  assert.ok(Math.abs(mapped[0]!.box.y - 0.5) < 0.001);
  assert.ok(Math.abs(mapped[0]!.box.height - 1000 * 0.25 / 3000) < 0.001);
});

test("mergeVisionLayoutBands collapses heavy overlaps", () => {
  const merged = mergeVisionLayoutBands(
    [
      {
        id: "a",
        label: "A",
        category: "feature",
        box: { x: 0, y: 0.1, width: 1, height: 0.2 },
        confidence: 0.6
      },
      {
        id: "b",
        label: "B",
        category: "feature",
        box: { x: 0, y: 0.12, width: 1, height: 0.22 },
        confidence: 0.9
      }
    ],
    12
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.id, "b");
});

test("shouldPreferVisionLooks when DOM looks are thin commerce/body", () => {
  const thin: SectionLookDescription[] = [
    {
      section_id: "1",
      signature: "body",
      category: "commerce",
      stack_summary: "body",
      look_summary: "thin",
      confidence: 0.5,
      evidence_refs: []
    },
    {
      section_id: "2",
      signature: "body",
      category: "content",
      stack_summary: "body",
      look_summary: "thin",
      confidence: 0.5,
      evidence_refs: []
    }
  ];
  assert.equal(shouldPreferVisionLooks(thin), true);
  assert.equal(
    shouldPreferVisionLooks([
      {
        section_id: "h",
        signature: "media>heading>cta",
        category: "hero",
        stack_summary: "stack",
        look_summary: "rich",
        confidence: 0.9,
        evidence_refs: []
      }
    ]),
    false
  );
});

test("visionBandsToSectionLooks attaches crop evidence", () => {
  const looks = visionBandsToSectionLooks(
    [
      {
        id: "band_1",
        label: "Hero",
        category: "hero",
        box: { x: 0, y: 0, width: 1, height: 0.2 },
        confidence: 0.9
      }
    ],
    [
      {
        band_id: "band_1",
        path: "viewports/desktop/sections/vision_band_1.webp",
        bbox_px: { left: 0, top: 0, width: 100, height: 50 },
        bytes: 10,
        sha256: "abc"
      }
    ],
    "cinematic page"
  );
  assert.equal(looks.length, 1);
  assert.equal(looks[0]!.section_id, "band_1");
  assert.equal(looks[0]!.category, "hero");
  assert.ok(looks[0]!.evidence_refs.includes("viewports/desktop/sections/vision_band_1.webp"));
  assert.ok(!looks[0]!.look_summary.includes("Page notes"));
});

test("renumberVisionBands uses band_1..n", async () => {
  const { renumberVisionBands } = await import("../src/vision-layout.js");
  const out = renumberVisionBands([
    {
      id: "tile_1_a",
      label: "Hero",
      category: "hero",
      box: { x: 0, y: 0, width: 1, height: 0.2 },
      confidence: 0.9
    },
    {
      id: "tile_2_b",
      label: "Footer",
      category: "footer",
      box: { x: 0, y: 0.8, width: 1, height: 0.2 },
      confidence: 0.8
    }
  ]);
  assert.deepEqual(
    out.map((band) => band.id),
    ["band_1", "band_2"]
  );
});

test("buildVisionLayoutTiles resizes wide images before extract", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-vision-tiles-"));
  const imagePath = join(root, "tall.jpg");
  await sharp({
    create: { width: 1920, height: 5000, channels: 3, background: { r: 20, g: 20, b: 30 } }
  })
    .jpeg()
    .toFile(imagePath);

  const built = await buildVisionLayoutTiles(imagePath, {
    maxBytes: 200_000,
    maxWidth: 1280,
    targetTileHeight: 1600
  });
  assert.ok(built.width <= 1280);
  assert.ok(built.tiles.length >= 2);
  assert.ok(built.tiles.every((tile) => tile.bytes.length > 0));
  assert.equal(built.tiles[0]?.fullHeight, built.height);
});
