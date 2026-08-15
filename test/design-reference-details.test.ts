import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  PROMPT_HARD_RULE_MARKERS,
  buildEmbeddingCanonical,
  constraintsFromLook,
  mapSignatureToTaxonomies,
  rolesFromSignature
} from "../src/design-reference-spec.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";

const FIX = "fixtures/design-references";

test("prompt-pack and layout-hints fixtures validate", () => {
  // Register schemas via kind names added to validator
  const prompt = JSON.parse(readFileSync(join(FIX, "prompt-pack.aurora.json"), "utf8"));
  const hints = JSON.parse(readFileSync(join(FIX, "aurora-layout-hints.expected.json"), "utf8"));
  assert.equal(validateAgainstSchema("designPromptPack", prompt).length, 0);
  assert.equal(validateAgainstSchema("designLayoutHints", hints).length, 0);
  for (const marker of PROMPT_HARD_RULE_MARKERS) {
    assert.ok(prompt.rules.some((rule: string) => rule.includes(marker.slice(0, 12))));
  }
  assert.equal(prompt.references[0].reference_id, "ref_aurora_hero");
  assert.ok(!JSON.stringify(hints).includes("Aurora Phone"));
});

test("look-conditioned mapping covers aurora signature roles", () => {
  const taxonomies = mapSignatureToTaxonomies("media>heading>cta");
  assert.deepEqual(taxonomies, [
    "dig:component.media",
    "dig:content.heading",
    "dig:component.button"
  ]);
  assert.deepEqual(rolesFromSignature("media>heading>cta"), ["media", "heading", "cta"]);
});

test("look constraints derive from aurora reference via mapping table", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8"));
  const constraints = constraintsFromLook(aurora);
  assert.ok(constraints.length >= 4);
  assert.ok(constraints.some((c) => /scrim/i.test(c)));
  assert.ok(constraints.some((c) => /CTA centered/i.test(c)));
  assert.ok(constraints.some((c) => /full-bleed/i.test(c)));
});

test("embedding canonical matches eval golden for aurora", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8"));
  const scenario = JSON.parse(
    readFileSync("fixtures/eval/design-reference-hero/scenario.json", "utf8")
  );
  assert.equal(buildEmbeddingCanonical(aurora), scenario.embedding_canonical_golden);
});

test("design-reference-hero eval scenario forbids login as primary", () => {
  const scenario = JSON.parse(
    readFileSync("fixtures/eval/design-reference-hero/scenario.json", "utf8")
  );
  assert.equal(scenario.golden.expected_primary_reference_id, "ref_aurora_hero");
  assert.equal(scenario.golden.forbidden_primary_reference_id, "ref_shop_login_form");
  assert.ok(scenario.golden.forbid_source_phrases.includes("Learn more"));
});
