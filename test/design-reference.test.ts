import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isFlowActionId } from "../src/flow-actions.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";

const FIXTURES = "fixtures/design-references";

test("design reference fixtures validate against DIG-012 schemas", () => {
  const refs = readdirSync(FIXTURES).filter((name) => name.endsWith(".reference.json"));
  assert.ok(refs.length >= 2);
  for (const name of refs) {
    const data = JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
    const issues = validateAgainstSchema("designReference", data);
    assert.equal(issues.length, 0, `${name}: ${issues.map((i) => i.message).join("; ")}`);
    assert.ok(data.look.look_summary.length > 40);
    assert.ok(data.composition.signature.includes(">"));
  }
});

test("aurora pack is look_conditioned and anchors hero reference", () => {
  const pack = JSON.parse(readFileSync(join(FIXTURES, "aurora-pack.pack.json"), "utf8"));
  assert.equal(validateAgainstSchema("designReferencePack", pack).length, 0);
  assert.equal(pack.synthesis_mode, "look_conditioned");
  assert.equal(pack.constraints.forbid_source_copy, true);
  assert.equal(pack.references.length, 1);
  assert.equal(validateAgainstSchema("designReference", pack.references[0]).length, 0);
  assert.match(pack.references[0].look.look_summary, /scrim|centered|CTA|cta/i);
  assert.ok(pack.references[0].taxonomy.taxonomy_ids.includes("dig:pattern.hero"));
});

test("login reference may carry optional DIG-011 flow_context", () => {
  const login = JSON.parse(readFileSync(join(FIXTURES, "login-form.reference.json"), "utf8"));
  assert.equal(validateAgainstSchema("designReference", login).length, 0);
  for (const id of login.flow_context.flow_action_ids) {
    assert.ok(isFlowActionId(id));
  }
});

test("DIG-012 prioritizes references over flows in challenge/spec", async () => {
  const { readFile } = await import("node:fs/promises");
  const spec = await readFile("docs/DIG-012-design-reference.md", "utf8");
  const challenge = await readFile("knowledge/dig-011-challenge.md", "utf8");
  assert.match(spec, /higher priority for agent value/);
  assert.match(spec, /dig_flow_/);
  assert.match(challenge, /DesignReference/);
  assert.match(challenge, /DIG-012/);
});
