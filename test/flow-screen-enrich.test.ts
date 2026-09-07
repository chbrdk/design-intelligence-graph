import assert from "node:assert/strict";
import test from "node:test";
import { assembleFlowGraph } from "../src/flow-assemble.js";
import {
  attachAnalysesToFlowDetail,
  flowDetectScreensFromAnalyses,
  loadFlowScreenAnalyses
} from "../src/flow-screen-enrich.js";
import { enrichFlowActionsC2 } from "../src/flow-actions-enrich.js";

test("loadFlowScreenAnalyses joins llm analyses and builds flow_context", async () => {
  const graph = assembleFlowGraph({
    appScopeId: "app_t",
    screens: [
      { capture_run_id: "cap_a", primary_url: "https://ex.example/", order: 0 },
      { capture_run_id: "cap_b", primary_url: "https://ex.example/login", order: 1 }
    ],
    edges: [
      {
        edge_id: "fe_1",
        from_capture_run_id: "cap_a",
        to_capture_run_id: "cap_b",
        trigger: { kind: "href" },
        activation: "inferred_href_only",
        method: "href_join",
        confidence: 0.8,
        provenance: { layer: "L2" }
      }
    ],
    flow_actions: []
  });

  const client = {
    async query(sql: string) {
      if (/FROM llm_analyses/i.test(sql)) {
        return {
          rows: [
            { capture_run_id: "cap_a", status: "complete", design_summary: "Home editorial." },
            { capture_run_id: "cap_b", status: "complete", design_summary: "Login form." }
          ]
        };
      }
      if (/FROM llm_items/i.test(sql)) {
        return {
          rows: [
            { capture_run_id: "cap_a", kind: "screen_pattern", name: "Landing" },
            { capture_run_id: "cap_b", kind: "screen_pattern", name: "Login" },
            { capture_run_id: "cap_b", kind: "ui_element", name: "form" },
            { capture_run_id: "cap_a", kind: "visual_style", name: "editorial" }
          ]
        };
      }
      return { rows: [] };
    }
  };

  const analyses = await loadFlowScreenAnalyses(client, graph);
  assert.equal(analyses.length, 2);
  assert.equal(analyses[0]!.design_summary, "Home editorial.");
  assert.deepEqual(analyses[0]!.screen_patterns, ["Landing"]);
  assert.equal(analyses[0]!.flow_context.next_url, "https://ex.example/login");
  assert.equal(analyses[0]!.flow_context.outbound_edge_count, 1);
  assert.equal(analyses[1]!.flow_context.prev_url, "https://ex.example/");
  assert.ok(analyses[1]!.ui_elements.includes("form"));

  const detail = attachAnalysesToFlowDetail(
    { schema_version: "0.1.0", flow: graph, media: {} },
    analyses
  );
  assert.equal(detail.analysis_coverage.with_summary, 2);
  assert.equal(detail.screen_analyses.length, 2);

  const detect = flowDetectScreensFromAnalyses(analyses);
  assert.equal(detect[1]!.has_form, true);
});

test("enrichFlowActionsC2 skips LLM unless DIG_FLOW_ACTIONS_LLM=true", async () => {
  const result = await enrichFlowActionsC2(
    {
      appScopeId: "app_t",
      screens: [
        { order: 0, url: "https://ex.example/login", has_form: true },
        { order: 1, url: "https://ex.example/" }
      ]
    },
    { enabled: false }
  );
  assert.equal(result.l3_status, "skipped");
  assert.ok(result.flow_actions.some((item) => item.taxonomy_id === "dig:flow.logging_in"));
});
