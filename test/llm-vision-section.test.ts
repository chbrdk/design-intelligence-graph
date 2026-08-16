import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  mergeSectionVisionIntoLook,
  shouldRunSectionVision,
  runVisionSectionAnalysis,
  runVisionBandSectionVisions,
  type LlmSectionVisionResult
} from "../src/llm-vision.js";
import type { SectionCropRecord } from "../src/section-crops.js";
import type { SectionLookDescription } from "../src/section-look.js";

const crop: SectionCropRecord = {
  section_id: "sec_hero",
  viewport_name: "desktop",
  viewport_capture_id: "vpc_1",
  category: "hero",
  signature: "media",
  path: "viewports/desktop/sections/sec_hero.webp",
  bbox_css: { x: 0, y: 0, width: 800, height: 400 },
  bbox_px: { left: 0, top: 0, width: 800, height: 400 },
  source_screenshot: "viewports/desktop/screenshots/full-page.webp",
  bytes: 100,
  sha256: "x",
  reason: "selected_geometry"
};

test("shouldRunSectionVision gates thin and high-value sections", () => {
  assert.equal(
    shouldRunSectionVision({ section_id: "a", signature: "media", category: "hero", confidence: 0.9 }, crop).ok,
    true
  );
  assert.equal(
    shouldRunSectionVision(
      { section_id: "b", signature: "heading>list", category: "content", confidence: 0.9 },
      crop
    ).ok,
    false
  );
  assert.equal(
    shouldRunSectionVision(
      { section_id: "c", signature: "heading>cta", category: "conversion", confidence: 0.6 },
      crop
    ).ok,
    true
  );
  assert.equal(
    shouldRunSectionVision({ section_id: "d", signature: "media", category: "hero", confidence: 0.9 }, undefined).ok,
    false
  );
});

test("mergeSectionVisionIntoLook appends vision notes", () => {
  const description: SectionLookDescription = {
    section_id: "sec_hero",
    signature: "media",
    category: "hero",
    stack_summary: "full-bleed media",
    look_summary: "Tall media band.",
    confidence: 0.7,
    evidence_refs: ["node_a"]
  };
  const vision: LlmSectionVisionResult = {
    section_id: "sec_hero",
    status: "complete",
    crop_path: crop.path,
    media_subject: "sports car at night",
    atmosphere: "dark high-contrast",
    overlay: "bottom gradient scrim",
    composition: "Centered vehicle fills the frame.",
    confidence: 0.82
  };
  const merged = mergeSectionVisionIntoLook(description, vision);
  assert.match(merged.look_summary, /Vision:/);
  assert.match(merged.look_summary, /sports car/i);
  assert.ok(merged.evidence_refs.includes("vision_section"));
  assert.ok((merged.confidence ?? 0) > description.confidence);
});

test("runVisionSectionAnalysis uses provider image call", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-vision-section-"));
  const dir = join(root, "viewports/desktop/sections");
  await mkdir(dir, { recursive: true });
  const webp = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 10, g: 10, b: 20 } }
  })
    .webp()
    .toBuffer();
  await writeFile(join(dir, "sec_hero.webp"), webp);

  const localCrop = { ...crop, path: "viewports/desktop/sections/sec_hero.webp" };
  const result = await runVisionSectionAnalysis(
    root,
    localCrop,
    { category: "hero", signature: "media" },
    {
      config: { enabled: true, provider: "openrouter", baseUrl: "http://local", model: "vision-test", timeoutMs: 1000 },
      provider: {
        async complete() {
          return {
            content: JSON.stringify({
              visible_text: ["911"],
              media_subject: "porsche",
              atmosphere: "dark",
              overlay: "none",
              cta_chrome: "",
              composition: "Car centered.",
              confidence: 0.8
            }),
            model: "vision-test",
            usage: { prompt_tokens: 10, completion_tokens: 20 }
          };
        }
      },
      gateReason: "thin_signature"
    }
  );
  assert.equal(result.status, "complete");
  assert.equal(result.media_subject, "porsche");
  assert.equal(result.gate_reason, "thin_signature");
});

test("runVisionBandSectionVisions runs all vision_layout_band crops without DOM gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-vision-band-"));
  const dir = join(root, "viewports/desktop/sections");
  await mkdir(dir, { recursive: true });
  const webp = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 10, g: 10, b: 20 } }
  })
    .webp()
    .toBuffer();
  await writeFile(join(dir, "band_1.webp"), webp);
  await writeFile(join(dir, "band_2.webp"), webp);

  const crops: SectionCropRecord[] = [
    {
      ...crop,
      section_id: "band_1",
      path: "viewports/desktop/sections/band_1.webp",
      signature: "heading>list",
      category: "content",
      reason: "vision_layout_band"
    },
    {
      ...crop,
      section_id: "band_2",
      path: "viewports/desktop/sections/band_2.webp",
      signature: "heading>list",
      category: "content",
      reason: "vision_layout_band"
    },
    {
      ...crop,
      section_id: "dom_only",
      path: "viewports/desktop/sections/band_1.webp",
      reason: "selected_geometry"
    }
  ];

  let calls = 0;
  const { results } = await runVisionBandSectionVisions({
    packageRoot: root,
    crops,
    bands: [
      {
        id: "band_1",
        label: "Grid",
        category: "feature",
        box: { x: 0, y: 0.2, width: 1, height: 0.2 },
        confidence: 0.8
      }
    ],
    config: { enabled: true, provider: "openrouter", baseUrl: "http://local", model: "vision-test", timeoutMs: 1000 },
    provider: {
      async complete() {
        calls += 1;
        return {
          content: JSON.stringify({
            visible_text: ["A"],
            media_subject: "cars",
            atmosphere: "bright",
            overlay: "none",
            cta_chrome: "",
            composition: "Three-up grid.",
            confidence: 0.75
          }),
          model: "vision-test",
          usage: { prompt_tokens: 5, completion_tokens: 10 }
        };
      }
    },
    maxSections: 8
  });

  assert.equal(calls, 2);
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => item.gate_reason === "vision_layout_band"));
  assert.equal(results[0]?.status, "complete");
});
