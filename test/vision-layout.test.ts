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
  refineVisionLayoutBands,
  renumberVisionBands,
  sanitizeVisionLayoutNotes,
  shouldPreferVisionLooks,
  visionBandsToSectionLooks,
  VISION_BAND_MIN_HEIGHT
} from "../src/vision-layout.js";
import type { SectionLookDescription } from "../src/section-look.js";
import type { VisionLayoutBand } from "../src/vision-layout.js";

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

test("renumberVisionBands uses band_1..n", () => {
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

test("sanitizeVisionLayoutNotes drops tile capture prose", () => {
  assert.equal(
    sanitizeVisionLayoutNotes(
      "The tile captures the bottom of a content section with a green background and the complete site footer."
    ),
    ""
  );
  assert.equal(sanitizeVisionLayoutNotes("High-contrast marketing stacks"), "High-contrast marketing stacks");
});

test("refineVisionLayoutBands snaps ticker gap, pulls nav into hero, merges micro footer", () => {
  // Geometry mirrors msqpartners.com cap_6c74829b… (normalized).
  const raw: VisionLayoutBand[] = [
    {
      id: "b1",
      label: "Hero Section",
      category: "hero",
      box: { x: 0, y: 0.0246, width: 1, height: 0.1446 },
      confidence: 0.98
    },
    {
      id: "b2",
      label: "Intro Copy & CTA",
      category: "content",
      box: { x: 0, y: 0.1693, width: 1, height: 0.0708 },
      confidence: 0.92
    },
    {
      id: "b3",
      label: "News Ticker",
      category: "other",
      box: { x: 0, y: 0.2400, width: 1, height: 0.0185 },
      confidence: 0.9
    },
    {
      id: "b4",
      label: "Why MSQ",
      category: "feature",
      box: { x: 0, y: 0.2708, width: 1, height: 0.1385 },
      confidence: 0.95
    },
    {
      id: "b5",
      label: "Our Work",
      category: "content",
      box: { x: 0, y: 0.4093, width: 1, height: 0.1693 },
      confidence: 0.98
    },
    {
      id: "b8",
      label: "Footer Navigation",
      category: "footer",
      box: { x: 0, y: 0.8687, width: 1, height: 0.1219 },
      confidence: 1
    },
    {
      id: "b9",
      label: "Footer Legal",
      category: "footer",
      box: { x: 0, y: 0.9906, width: 1, height: 0.0094 },
      confidence: 1
    }
  ];

  const refined = renumberVisionBands(refineVisionLayoutBands(raw));
  assert.equal(refined[0]!.box.y, 0);
  assert.ok(refined[0]!.box.height > 0.16);

  const ticker = refined.find((band) => /ticker/i.test(band.label));
  assert.ok(ticker, "ticker band retained");
  // Gap before Why MSQ (~0.012) must be absorbed so VL sees the blue bar.
  const why = refined.find((band) => /why msq/i.test(band.label));
  assert.ok(why);
  const tickerBottom = ticker!.box.y + ticker!.box.height;
  assert.ok(Math.abs(tickerBottom - why!.box.y) < 0.001, `expected closed gap, got ${tickerBottom} vs ${why!.box.y}`);
  assert.ok(ticker!.box.height >= VISION_BAND_MIN_HEIGHT - 1e-9);

  assert.ok(!refined.some((band) => /legal/i.test(band.label)));
  const footer = refined.find((band) => band.category === "footer");
  assert.ok(footer);
  assert.ok(footer!.box.y + footer!.box.height >= 0.999);

  for (const band of refined) {
    assert.equal(band.box.x, 0);
    assert.equal(band.box.width, 1);
    assert.ok(band.box.height > 0);
  }
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
