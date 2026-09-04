import assert from "node:assert/strict";
import test from "node:test";
import {
  captureIdsFromVectorHits,
  diversifyLibraryScreens,
  libraryScreenSearchConfig,
  rankLibraryScreens,
  rankScreensByDense,
  resolveScreenSearchProvider,
  searchLibraryScreens,
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

test("captureIdsFromVectorHits drops junk hosts and dedupes", () => {
  const ids = captureIdsFromVectorHits(
    [
      { capture_run_id: "cap_a", site_domain: "good.example", score: 0.9 },
      { capture_run_id: "cap_junk", site_domain: "chromewebdata", score: 0.99 },
      { capture_run_id: "cap_a", site_domain: "good.example", score: 0.8 },
      { capture_run_id: "cap_b", site_domain: "other.example", score: 0.7 }
    ],
    ["chromewebdata"]
  );
  assert.deepEqual(ids, ["cap_a", "cap_b"]);
});

test("libraryScreenSearchConfig exposes corpus pool and MMR defaults", () => {
  const cfg = libraryScreenSearchConfig();
  assert.equal(cfg.candidatePool, 128);
  assert.equal(cfg.candidatePoolCap, 200);
  assert.equal(cfg.diversify, true);
  assert.ok(cfg.mmrLambda > 0 && cfg.mmrLambda <= 1);
});

test("diversifyLibraryScreens breaks same-domain sticky hubs", () => {
  const screens = [
    { capture_run_id: "a1", site_domain: "hub.example", score: 0.95, design_facets: { style: "minimal" } },
    { capture_run_id: "a2", site_domain: "hub.example", score: 0.94, design_facets: { style: "minimal" } },
    { capture_run_id: "a3", site_domain: "hub.example", score: 0.93, design_facets: { style: "minimal" } },
    { capture_run_id: "b1", site_domain: "other.example", score: 0.9, design_facets: { style: "editorial" } },
    { capture_run_id: "c1", site_domain: "third.example", score: 0.88, design_facets: { style: "minimal" } }
  ];
  const diversified = diversifyLibraryScreens(screens, 3, { mmrLambda: 0.65 });
  assert.equal(diversified.length, 3);
  const domains = new Set(diversified.map((row) => row.site_domain));
  assert.ok(domains.size >= 2, "expected at least two domains in Top-3");
  assert.equal(diversified[0]?.capture_run_id, "a1");
  assert.ok(diversified.some((row) => row.site_domain === "other.example" || row.site_domain === "third.example"));
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

test("searchLibraryScreens retrieval-first hydrates corpus hits before window browse", async () => {
  const prev = { ...process.env };
  process.env.DIG_EMBEDDING_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(1024).fill(0.02) }] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  try {
    const client = {
      async query(sql: string, values?: unknown[]) {
        if (/dense_embeddings/i.test(sql) && /<=>/.test(sql) && !/ANY\(\$\d+::text\[\]\)/.test(sql)) {
          // corpus-wide vector search (no capture_run_ids filter)
          return {
            rows: [
              { capture_run_id: "cap_old", site_domain: "old.example", score: 0.94 },
              { capture_run_id: "cap_new", site_domain: "new.example", score: 0.88 },
              { capture_run_id: "cap_junk", site_domain: "chromewebdata", score: 0.99 }
            ]
          };
        }
        if (/DISTINCT ON \(v\.capture_run_id\)/i.test(sql)) {
          const ids = (values?.[0] as string[]) ?? [];
          assert.ok(ids.includes("cap_old"));
          assert.equal(ids.includes("cap_junk"), false);
          return {
            rows: ids.flatMap((id) => [
              {
                id: 1,
                capture_run_id: id,
                viewport_capture_id: `vpc_${id}`,
                name: "desktop",
                status: "ok",
                width: 1440,
                height: 900,
                document_width: 1440,
                document_height: 2000,
                title: id,
                settled_screenshot_path: null,
                full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp",
                canonical_url: `https://${id}.example/`,
                site_domain: id === "cap_old" ? "old.example" : "new.example",
                package_path: null
              }
            ])
          };
        }
        // newest-window browse should not be required for corpus path
        return { rows: [] };
      }
    };
    const result = await searchLibraryScreens(client, {
      q: "minimal monochrome large type",
      provider: "dense",
      limit: 5
    });
    assert.equal(result.retrieval, "corpus");
    assert.equal(result.provider, "dense");
    assert.deepEqual(
      result.screens.map((row) => row.capture_run_id),
      ["cap_old", "cap_new"]
    );
    assert.ok((result.screens[0]?.score ?? 0) >= (result.screens[1]?.score ?? 0));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = prev;
  }
});
