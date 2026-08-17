import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  HARD_RULES,
  PROMPT_PACK_MAX_BYTES,
  assembleDesignPromptPack,
  compactDesignReference,
  syntheticScreenReference
} from "../src/design-prompt-pack.js";
import type { DesignReferenceRecord } from "../src/design-reference-emit.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";

const FIX = "fixtures/design-references";

test("assembles aurora prompt pack under budget with hard rules", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const pack = {
    schema_version: "0.1.0" as const,
    intent: "premium centered hero",
    references: [aurora],
    synthesis_mode: "look_conditioned" as const,
    constraints: { forbid_source_copy: true as const }
  };
  const prompt = assembleDesignPromptPack({
    brief: "Design a product launch hero that feels premium and centered.",
    pack,
    output_contract: "layout_hints_json"
  });
  assert.equal(prompt.schema_version, "0.1.0");
  assert.equal(prompt.references[0]?.reference_id, "ref_aurora_hero");
  assert.ok(JSON.stringify(prompt).length <= PROMPT_PACK_MAX_BYTES);
  for (const rule of HARD_RULES) {
    assert.ok(prompt.rules.some((line) => line.includes(rule.slice(0, 24))));
  }
  assert.equal(validateAgainstSchema("designPromptPack", prompt).length, 0);
  assert.ok(!JSON.stringify(prompt.references).includes("Aurora Phone"));
  assert.equal(prompt.look_contract?.colors.accent, "#0071e3");
  assert.equal(prompt.look_contract?.radius_px, 18);
  assert.ok(prompt.rules.some((line) => line.includes("glassmorphism")));
  assert.ok(prompt.rules.some((line) => line.includes("#0071e3")));
  assert.ok(prompt.ask.includes("look_contract"));
});

test("compact reference drops page_context and keeps look cues", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const compact = compactDesignReference(aurora);
  assert.equal((compact.look.overlay as { kind?: string } | undefined)?.kind, "scrim");
  assert.ok(!("page_context" in compact));
  assert.ok(!("provenance" in compact));
  assert.ok((compact.tokens?.colors?.length ?? 0) >= 1);
});

test("synthetic screen reference assembles a capture prompt pack with look_contract", () => {
  const ref = syntheticScreenReference({
    captureRunId: "cap_msq_test",
    visionPage: {
      page_type: "marketing_agency_landing_page",
      overall_atmosphere: "high-energy",
      color_mood: "electric blue",
      layout_system: "full-bleed stacks",
      spacing_feel: "uneven cinematic gaps",
      above_fold_job: "Brand momentum"
    },
    lookContract: {
      schema_version: "0.1.0",
      look_contract_version: "0.1.0",
      colors: { bg: "#141414", ink: "#ffffff", accent: "#d6d6d6" },
      typography: { display: "GT America 64px / 700", body: null },
      radius_px: 8,
      cta_chrome: "outline",
      density: "uneven",
      avoid: ["glassmorphism / frosted-blur panels"]
    },
    style: "high-energy",
    layout: "full-bleed stacks"
  });
  assert.equal(ref.scope, "screen");
  assert.equal(ref.capture_run_id, "cap_msq_test");
  const prompt = assembleDesignPromptPack({
    brief: "Rebuild this captured screen. Obey look_contract.",
    pack: {
      schema_version: "0.1.0",
      intent: "rebuild",
      references: [ref],
      synthesis_mode: "look_conditioned",
      constraints: { forbid_source_copy: true }
    },
    look_contract: {
      schema_version: "0.1.0",
      look_contract_version: "0.1.0",
      colors: { bg: "#141414", ink: "#ffffff", accent: "#d6d6d6" },
      typography: { display: "GT America 64px / 700", body: null },
      radius_px: 8,
      cta_chrome: "outline",
      density: "uneven",
      avoid: ["glassmorphism / frosted-blur panels"]
    }
  });
  assert.equal(prompt.look_contract?.colors.accent, "#d6d6d6");
  assert.equal(prompt.look_contract?.cta_chrome, "outline");
  assert.ok(prompt.rules.some((line) => line.includes("#141414")));
  assert.equal(validateAgainstSchema("designPromptPack", prompt).length, 0);
});
