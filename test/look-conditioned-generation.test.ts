import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { DesignReferenceRecord } from "../src/design-reference-emit.js";
import {
  LOOK_CONDITIONED_GENERATION_VERSION,
  deriveLookConditionedLayout
} from "../src/look-conditioned-generation.js";

const FIX = "fixtures/design-references";

test("blank-canvas look_conditioned layout from aurora pack", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const pack = JSON.parse(readFileSync(join(FIX, "aurora-pack.pack.json"), "utf8"));
  pack.references = [aurora];
  const spec = deriveLookConditionedLayout({ pack });
  assert.equal(spec.generation_version, LOOK_CONDITIONED_GENERATION_VERSION);
  assert.equal(spec.intent, "look_conditioned_structural_synthesis");
  assert.equal(spec.provenance.seed, "blank_canvas");
  assert.deepEqual(
    spec.blocks.map((b) => b.taxonomy_id),
    ["dig:component.media", "dig:content.heading", "dig:component.button"]
  );
  assert.equal(spec.token_hints?.colors?.accent, "#0071e3");
  assert.equal(spec.token_hints?.shape?.radius, "18px");
  assert.equal(spec.look_contract?.colors.accent, "#0071e3");
  assert.equal(spec.provenance.look_contract_used, true);
  assert.ok(spec.provenance.methods.includes("look_contract_token_hints"));
  assert.ok(spec.constraints.some((c) => /scrim/i.test(c)));
  assert.ok(spec.constraints.some((c) => /full-bleed/i.test(c)));
  assert.ok(spec.constraints.some((c) => c.includes("glassmorphism")));
  assert.ok(spec.provenance.reference_ids?.includes("ref_aurora_hero"));
  assert.ok(!JSON.stringify(spec).includes("Aurora Phone"));
  assert.ok(!JSON.stringify(spec).includes("Learn more"));
});

test("layout_hints proposed_signature overrides when roles map", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const pack = {
    schema_version: "0.1.0" as const,
    intent: "hero",
    references: [aurora],
    synthesis_mode: "look_conditioned" as const,
    constraints: { forbid_source_copy: true as const }
  };
  const spec = deriveLookConditionedLayout({
    pack,
    layout_hints: {
      proposed_signature: "nav>heading>cta",
      look_directives: ["keep quiet chrome"],
      avoid: ["multi-CTA hero"],
      cited_reference_ids: ["ref_aurora_hero"]
    }
  });
  assert.equal(spec.blocks[0]?.taxonomy_id, "dig:component.navigation");
  assert.ok(spec.provenance.methods.includes("layout_hints_merge"));
  assert.equal(spec.provenance.layout_hints_used, true);
  assert.ok(spec.constraints.some((c) => c.startsWith("hint:keep quiet")));
  assert.ok(spec.constraints.some((c) => c.includes("multi-CTA")));
});

test("look_contract measured colors beat layout_hints token_hints", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const pack = {
    schema_version: "0.1.0" as const,
    intent: "hero",
    references: [aurora],
    synthesis_mode: "look_conditioned" as const,
    constraints: { forbid_source_copy: true as const }
  };
  const spec = deriveLookConditionedLayout({
    pack,
    look_contract: {
      schema_version: "0.1.0",
      look_contract_version: "0.1.0",
      colors: { bg: "#141414", ink: "#ffffff", accent: "#00e5ff" },
      typography: { display: "GT America 64px / 700", body: null },
      radius_px: 0,
      cta_chrome: "outline",
      density: "tight",
      avoid: ["glassmorphism / frosted-blur panels"]
    },
    layout_hints: {
      token_hints: { colors: { accent: "#7c3aed", extra: "#abcdef" } }
    }
  });
  assert.equal(spec.token_hints?.colors?.accent, "#00e5ff");
  assert.equal(spec.token_hints?.colors?.extra, "#abcdef");
  assert.equal(spec.token_hints?.shape?.cta_chrome, "outline");
  assert.equal(spec.generation_version, "0.3.0");
});
