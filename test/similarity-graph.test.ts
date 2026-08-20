import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSimilarityGraphCache,
  loadSimilarityGraph,
  similarityGraphConfig,
  undirectedEdgeKey
} from "../src/similarity-graph.js";

test("similarityGraphConfig reads knowledge/paths.json caps", () => {
  const cfg = similarityGraphConfig();
  assert.equal(cfg.nodeCap, 5000);
  assert.equal(cfg.edgeCap, 40000);
  assert.equal(cfg.threshold, 0.72);
  assert.equal(cfg.pageSize, 120);
  assert.equal(cfg.neighborK, 8);
  assert.equal(cfg.cacheTtlMs, 600_000);
});

test("undirectedEdgeKey is order-invariant", () => {
  assert.equal(undirectedEdgeKey("a", "b"), undirectedEdgeKey("b", "a"));
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
          }
        ]
      };
    }
  };
  const graph = await loadSimilarityGraph(client, "craft");
  assert.equal(graph.kind, "craft");
  assert.equal(graph.total, 2);
  assert.equal(graph.cached, false);
  assert.equal(graph.edges[0]?.score, 0.88);
  const again = await loadSimilarityGraph(client, "craft");
  assert.equal(again.cached, true);
  assert.equal(builds, 1);
  const refreshed = await loadSimilarityGraph(client, "craft", process.cwd(), { refresh: true });
  assert.equal(refreshed.cached, false);
  assert.equal(builds, 2);
});
