import assert from "node:assert/strict";
import test from "node:test";
import type { DesignTokensDocument } from "../src/design-tokens.js";
import {
  GENERIC_AI_AVOID,
  asLookContract,
  buildLookContract,
  lookContractHasMeasuredTokens,
  lookContractRules,
  tokenHintsFromLookContract
} from "../src/look-contract.js";

const measured: DesignTokensDocument = {
  schema_version: "0.1.0",
  design_tokens_version: "0.1.0",
  generated_at: "2026-08-17T00:00:00.000Z",
  source: {
    viewport_name: "desktop",
    viewport_capture_id: "vpc_desktop",
    visual_language_path: "derived/visual-language.json"
  },
  roles: {
    colors: [
      { hex: "#0a0a0a", hex_rgb: "#0a0a0a", role: "bg", occurrences: 1, source_roles: ["background"] },
      { hex: "#f5f5f5", hex_rgb: "#f5f5f5", role: "ink", occurrences: 1, source_roles: ["foreground"] },
      { hex: "#00e5ff", hex_rgb: "#00e5ff", role: "accent", occurrences: 1, source_roles: ["accent"] }
    ],
    typography: [
      {
        role: "display",
        family: "GT America",
        families: ["GT America"],
        size_px: 64,
        weight: 700,
        line_height: "1.05",
        occurrences: 1
      },
      {
        role: "body",
        family: "GT America",
        families: ["GT America"],
        size_px: 16,
        weight: 400,
        line_height: "1.5",
        occurrences: 1
      }
    ],
    radii: [{ role: "md", value_px: 4, occurrences: 1 }],
    motion: { animated: false, properties: [], runtime_instances: 0 }
  },
  recipes: {
    primary_cta: { style: "outline", fill: null, ink: "#00e5ff", radius_px: 0, notes: "" },
    scrim: { style: "none", stops: [], notes: "" },
    surface: { bg: "#0a0a0a", ink: "#f5f5f5", notes: "" }
  },
  dtcg: {}
};

test("buildLookContract uses measured tokens and generic avoid", () => {
  const contract = buildLookContract({
    tokens: measured,
    spacing_feel: "tight compact nav",
    layout: "full-bleed stacks",
    style: "high-energy"
  });
  assert.equal(contract.colors.bg, "#0a0a0a");
  assert.equal(contract.colors.accent, "#00e5ff");
  assert.equal(contract.typography.display, "GT America 64px / 700");
  assert.equal(contract.radius_px, 0);
  assert.equal(contract.cta_chrome, "outline");
  assert.equal(contract.density, "tight");
  assert.ok(GENERIC_AI_AVOID.every((item) => contract.avoid.includes(item)));
  assert.ok(contract.avoid.includes("card grid in the hero"));
  assert.ok(contract.avoid.includes("filled neon gradient CTAs"));
  assert.equal(lookContractHasMeasuredTokens(contract), true);
  const rules = lookContractRules(contract);
  assert.ok(rules.some((line) => line.includes("#00e5ff")));
  assert.ok(rules.some((line) => line.includes("outline")));
});

test("buildLookContract falls back to compact reference tokens", () => {
  const contract = buildLookContract({
    compact_tokens: {
      colors: [
        { hex: "#f5f5f7", roles: ["background"] },
        { hex: "#1d1d1f", roles: ["foreground"] },
        { hex: "#0071e3", roles: ["accent", "cta"] }
      ],
      typography: [{ family: "Helvetica Neue", size: "56px", weight: "700", role: "display" }],
      radii: ["18px"],
      style_labels: ["minimal"]
    },
    style: "minimal"
  });
  assert.equal(contract.colors.accent, "#0071e3");
  assert.equal(contract.typography.display, "Helvetica Neue 56px / 700");
  assert.equal(contract.radius_px, 18);
  assert.ok(contract.avoid.includes("heavy drop shadows and floating glass cards"));
});

test("asLookContract accepts API body objects", () => {
  const parsed = asLookContract({
    colors: { bg: "#111", ink: "#eee", accent: "#f00" },
    cta_chrome: "fill",
    avoid: ["glassmorphism / frosted-blur panels"]
  });
  assert.equal(parsed?.colors.bg, "#111");
  assert.equal(parsed?.cta_chrome, "fill");
  assert.equal(asLookContract({ brief: "nope" }), null);
});

test("tokenHintsFromLookContract maps roles onto layout-spec slots", () => {
  const contract = buildLookContract({ tokens: measured, spacing_feel: "tight" });
  const hints = tokenHintsFromLookContract(contract);
  assert.equal(hints.colors.background, "#0a0a0a");
  assert.equal(hints.colors.foreground, "#f5f5f5");
  assert.equal(hints.colors.accent, "#00e5ff");
  assert.equal(hints.typography.heading, "GT America 64px / 700");
  assert.equal(hints.shape.radius, "0px");
  assert.equal(hints.shape.cta_chrome, "outline");
  assert.equal(hints.shape.density, "tight");
});
