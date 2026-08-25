import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSimilarityGraphCache,
  combinedNeighborScore,
  facetAffinity,
  isExcludedDomain,
  loadSimilarityGraph,
  mmrSelectNeighbors,
  normalizeDomain,
  sharesHardFacet,
  similarityGraphConfig,
  undirectedEdgeKey
} from "../src/similarity-graph.js";

test("similarityGraphConfig reads knowledge/paths.json caps and hub mitigations", () => {
  const cfg = similarityGraphConfig();
  assert.equal(cfg.nodeCap, 5000);
  assert.equal(cfg.edgeCap, 40000);
  assert.equal(cfg.threshold, 0.72);
  assert.equal(cfg.pageSize, 120);
  assert.equal(cfg.neighborK, 8);
  assert.equal(cfg.cacheTtlMs, 600_000);
  assert.ok(cfg.excludeDomains.includes("chromewebdata"));
  assert.ok(cfg.candidatePool >= cfg.neighborK);
  assert.ok(cfg.facetWeight > 0 && cfg.facetWeight < 1);
  assert.ok(cfg.mmrLambda > 0 && cfg.mmrLambda <= 1);
});

test("undirectedEdgeKey is order-invariant", () => {
  assert.equal(undirectedEdgeKey("a", "b"), undirectedEdgeKey("b", "a"));
});

test("excludeDomains catches chromewebdata and www variants", () => {
  assert.equal(isExcludedDomain("chromewebdata"), true);
  assert.equal(isExcludedDomain("www.forsale.godaddy.com"), true);
  assert.equal(isExcludedDomain("thelinestudio.com"), false);
  assert.equal(normalizeDomain("https://www.Oakame.com/en/"), "oakame.com");
});

test("facetAffinity rewards style and industry overlap", () => {
  const a = {
    page_type: "other",
    style: "editorial",
    layout: null,
    industry_tags: ["tech", "marketing_agency"]
  };
  const same = facetAffinity(a, {
    page_type: "other",
    style: "editorial",
    layout: null,
    industry_tags: ["tech"]
  });
  const different = facetAffinity(a, {
    page_type: "other",
    style: "corporate",
    layout: null,
    industry_tags: ["government"]
  });
  assert.ok(same > different);
  assert.equal(sharesHardFacet(a, { page_type: "other", style: "editorial", layout: null, industry_tags: [] }), true);
  assert.equal(sharesHardFacet(a, { page_type: "other", style: "corporate", layout: null, industry_tags: ["government"] }), false);
});

test("combinedNeighborScore demotes hard facet mismatches", () => {
  const match = combinedNeighborScore(0.92, 0.9, 0.35, true);
  const mismatch = combinedNeighborScore(0.92, 0.2, 0.35, false);
  assert.ok(match > mismatch);
});

test("mmrSelectNeighbors prefers unique domains over repeated hubs", () => {
  const picked = mmrSelectNeighbors(
    [
      { id: "a", cosine: 0.94, score: 0.94, domain: "hub.example", style: "editorial" },
      { id: "b", cosine: 0.93, score: 0.93, domain: "hub.example", style: "editorial" },
      { id: "c", cosine: 0.91, score: 0.91, domain: "other.example", style: "minimal" },
      { id: "d", cosine: 0.9, score: 0.9, domain: "third.example", style: "corporate" }
    ],
    3,
    0.7
  );
  const domains = picked.map((row) => row.domain);
  assert.equal(new Set(domains).size, 3);
  assert.ok(domains.includes("other.example"));
});

test("loadSimilarityGraph returns craft nodes and knn edges and caches", async () => {
  clearSimilarityGraphCache();
  let builds = 0;
  const client = {
    async query(sql: string) {
      if (/COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ total: 2 }] };
      }
      if (/CROSS JOIN LATERAL/i.test(sql)) {
        builds += 1;
        return { rows: [{ from_id: "cap_a", to_id: "cap_b", score: 0.88 }] };
      }
      return {
        rows: [
          {
            capture_run_id: "cap_a",
            site_domain: "a.example",
            canonical_url: "https://a.example/",
            viewport_capture_id: "vpc_a",
            title: "A"
          },
          {
            capture_run_id: "cap_b",
            site_domain: "b.example",
            canonical_url: "https://b.example/",
            viewport_capture_id: "vpc_b",
            title: "B"
          },
          {
            capture_run_id: "cap_junk",
            site_domain: "chromewebdata",
            canonical_url: "chromewebdata://",
            viewport_capture_id: "vpc_j",
            title: ""
          }
        ]
      };
    }
  };
  const graph = await loadSimilarityGraph(client, "craft");
  assert.equal(graph.kind, "craft");
  assert.equal(graph.total, 2);
  assert.equal(graph.cached, false);
  assert.equal(graph.nodes.some((n) => n.site_domain === "chromewebdata"), false);
  assert.equal(graph.edges[0]?.score, 0.88);
  const again = await loadSimilarityGraph(client, "craft");
  assert.equal(again.cached, true);
  assert.equal(builds, 1);
  const refreshed = await loadSimilarityGraph(client, "craft", process.cwd(), { refresh: true });
  assert.equal(refreshed.cached, false);
  assert.equal(builds, 2);
});
