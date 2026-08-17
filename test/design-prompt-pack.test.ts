import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  HARD_RULES,
  PROMPT_PACK_MAX_BYTES,
  assembleDesignPromptPack,
  compactDesignReference
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
