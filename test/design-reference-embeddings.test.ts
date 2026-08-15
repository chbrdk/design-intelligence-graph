import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildDesignReferenceEmbeddingRow,
  cosineSimilarity,
  rankReferencesBySimilarity
} from "../src/design-reference-embeddings.js";
import type { DesignReferenceRecord } from "../src/design-reference-emit.js";
import { buildEmbeddingCanonical } from "../src/design-reference-spec.js";

const FIX = "fixtures/design-references";

test("aurora embedding row uses hashing provider and stable dims", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const row = buildDesignReferenceEmbeddingRow(aurora);
  assert.equal(row.reference_id, "ref_aurora_hero");
  assert.equal(row.provider, "dig-hashing-v1");
  assert.equal(row.dims, 384);
  assert.equal(row.vector.length, 384);
  assert.equal(row.canonical_sha256.length, 64);
  assert.equal(buildEmbeddingCanonical(aurora).length <= 1500, true);
});

test("similar_to ranks aurora nearer a product-hero twin than login form", () => {
  const aurora = JSON.parse(readFileSync(join(FIX, "aurora-hero.reference.json"), "utf8")) as DesignReferenceRecord;
  const login = JSON.parse(readFileSync(join(FIX, "login-form.reference.json"), "utf8")) as DesignReferenceRecord;
  const twin: DesignReferenceRecord = {
    ...aurora,
    reference_id: "ref_aurora_twin",
    look: {
      ...aurora.look,
      look_summary: "Minimalist product hero with full-bleed photo and centered CTA scrim."
    }
  };
  const ranked = rankReferencesBySimilarity({
    anchor: aurora,
    corpus: [aurora, twin, login],
    limit: 5
  });
  assert.equal(ranked[0]?.reference_id, "ref_aurora_twin");
  assert.ok((ranked[0]?.score ?? 0) > (ranked.find((r) => r.reference_id === login.reference_id)?.score ?? -1));
  assert.ok(!ranked.some((r) => r.reference_id === aurora.reference_id));
});

test("cosineSimilarity is 1 for identical vectors", () => {
  const v = [0.5, 0.5, 0, 0];
  assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9);
});
