import assert from "node:assert/strict";
import test from "node:test";
import {
  rankLibraryScreens,
  rankScreensByDense,
  resolveScreenSearchProvider,
  usesSemanticScreenQuery
} from "../src/library-screen-rank.js";

test("resolveScreenSearchProvider defaults to dense when q is set", () => {
  assert.equal(resolveScreenSearchProvider(null, null), "hashing");
  assert.equal(resolveScreenSearchProvider(undefined, "minimal monochrome"), "dense");
  assert.equal(resolveScreenSearchProvider("hashing", "minimal"), "hashing");
  assert.equal(resolveScreenSearchProvider("screenshot", "minimal"), "screenshot");
  assert.equal(usesSemanticScreenQuery("dense"), true);
  assert.equal(usesSemanticScreenQuery("screenshot"), true);
  assert.equal(usesSemanticScreenQuery("hashing"), false);
});

test("rankScreensByDense orders by cosine score and skips facet-q duty", async () => {
  const prev = { ...process.env };
  process.env.DIG_EMBEDDING_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "test-key";
  const screens = [{ capture_run_id: "cap_low" }, { capture_run_id: "cap_high" }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(1024).fill(0.01) }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  try {
    const client = {
      async query(sql: string) {
        assert.match(sql, /dense_embeddings/);
        return {
          rows: [
            { capture_run_id: "cap_high", score: 0.91 },
            { capture_run_id: "cap_low", score: 0.12 }
          ]
        };
      }
    };
    const ranked = await rankScreensByDense(client, screens, "minimal monochrome large type");
    assert.deepEqual(
      ranked.map((row) => row.capture_run_id),
      ["cap_high", "cap_low"]
    );
    const hashing = await rankLibraryScreens(client, screens, "minimal", "hashing");
    assert.equal(hashing[0]?.capture_run_id, "cap_low");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = prev;
  }
});
