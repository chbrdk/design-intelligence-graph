import assert from "node:assert/strict";
import test from "node:test";
import { isConsentOverlaySection, isConsentOverlayText } from "../src/consent-noise.js";
import { shouldRunSectionVision } from "../src/llm-vision.js";
import type { SectionCropRecord } from "../src/section-crops.js";
import { getCookieBannerDismissScript, COOKIE_BANNER_HIDE_CSS } from "../src/cookie-banner-dismiss.js";
import { designReferenceFromSectionLook } from "../src/design-reference-emit.js";
import type { SectionLookDescription } from "../src/section-look.js";

const crop: SectionCropRecord = {
  section_id: "sec_cookie",
  viewport_name: "desktop",
  viewport_capture_id: "vpc_1",
  category: "commerce",
  signature: "media",
  path: "viewports/desktop/sections/sec_cookie.webp",
  bbox_css: { x: 0, y: 0, width: 800, height: 400 },
  bbox_px: { left: 0, top: 0, width: 800, height: 400 },
  source_screenshot: "viewports/desktop/screenshots/full-page.webp",
  bytes: 100,
  sha256: "x",
  reason: "selected_geometry"
};

test("consent noise detects cookie copy", () => {
  assert.equal(isConsentOverlayText("Ihre Cookie Einstellungen"), true);
  assert.equal(isConsentOverlayText("Alle akzeptieren"), true);
  assert.equal(isConsentOverlayText("sports car hero"), false);
  assert.equal(
    isConsentOverlaySection({
      category: "commerce",
      look_summary: "Modal with Alle akzeptieren and Cookie Einstellungen"
    }),
    true
  );
  assert.equal(
    isConsentOverlaySection({ category: "cookie_consent", taxonomy_id: "dig:section.cookie_consent" }),
    true
  );
});

test("consent noise rejects vision payloads that describe CMP chrome", async () => {
  const { isConsentOverlayVision } = await import("../src/consent-noise.js");
  assert.equal(
    isConsentOverlayVision({
      visible_text: ["Ihre Cookie Einstellungen"],
      cta_chrome: "Alle akzeptieren"
    }),
    true
  );
  assert.equal(isConsentOverlayVision({ visible_text: ["PORSCHE", "Flachbau RS."], cta_chrome: "" }), false);
});

test("shouldRunSectionVision skips consent overlays", () => {
  const gate = shouldRunSectionVision(
    {
      section_id: "sec_cookie",
      signature: "media",
      category: "commerce",
      confidence: 0.5,
      look_summary: "Cookie banner Alle akzeptieren",
      stack_summary: "dialog"
    },
    crop
  );
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "consent_overlay");
});

test("cookie dismiss script embeds hide css and accept texts", () => {
  assert.match(COOKIE_BANNER_HIDE_CSS, /onetrust/i);
  const script = getCookieBannerDismissScript();
  assert.match(script, /dig-cookie-banner-hide/);
  assert.match(script, /alle akzeptieren/);
});

test("designReferenceFromSectionLook emits section_crop media_ref", () => {
  const description: SectionLookDescription = {
    section_id: "sec_hero",
    signature: "media",
    category: "hero",
    stack_summary: "full-bleed media",
    look_summary: "Tall media band with centered product photography and overlay copy.",
    confidence: 0.8,
    evidence_refs: ["node_a"]
  };
  const withCrop = designReferenceFromSectionLook({
    captureRunId: "cap_test",
    description,
    cropPath: "viewports/desktop/sections/sec_hero.webp"
  });
  assert.equal(withCrop.media_ref?.kind, "section_crop");
  assert.equal(withCrop.media_ref?.path, "viewports/desktop/sections/sec_hero.webp");
  assert.ok(withCrop.provenance.methods.includes("section_crop"));

  const without = designReferenceFromSectionLook({ captureRunId: "cap_test", description });
  assert.equal(without.media_ref?.kind, "none");
});
