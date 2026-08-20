import assert from "node:assert/strict";
import test from "node:test";
import { loadSimilarityGraph, similarityGraphConfig } from "../src/similarity-graph.js";

test("similarityGraphConfig reads knowledge/paths.json caps", () => {
  const cfg = similarityGraphConfig();
  assert.equal(cfg.nodeCap, 250);
  assert.equal(cfg.edgeCap, 750);
  assert.equal(cfg.threshold, 0.72);
});

test("loadSimilarityGraph returns craft nodes and pairwise edges", async () => {
  const sqls: string[] = [];
  const client = {
    async query(sql: string) {
      sqls.push(sql);
      if (/1 - \(a\.embedding <=> b\.embedding\)/i.test(sql)) {
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
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges[0]?.score, 0.88);
  assert.match(sqls[0] ?? "", /dense_embeddings/);
});
