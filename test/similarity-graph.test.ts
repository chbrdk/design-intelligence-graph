import assert from "node:assert/strict";
import test from "node:test";
import {
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
});

test("undirectedEdgeKey is order-invariant", () => {
  assert.equal(undirectedEdgeKey("a", "b"), undirectedEdgeKey("b", "a"));
});

test("loadSimilarityGraph returns craft nodes and knn edges", async () => {
  const sqls: string[] = [];
  const client = {
    async query(sql: string) {
      sqls.push(sql);
      if (/COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ total: 2 }] };
      }
      if (/CROSS JOIN LATERAL/i.test(sql)) {
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
  assert.equal(graph.page_size, 120);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges[0]?.score, 0.88);
  assert.match(sqls[1] ?? "", /dense_embeddings/);
  assert.match(sqls.some((sql) => /CROSS JOIN LATERAL/i.test(sql)) ? "lateral" : "", /lateral/);
});
