import assert from "node:assert/strict";
import test from "node:test";
import { deriveAnalysisReport } from "../src/analysis-pipeline.js";
import {
  buildDesignEvidencePrompt,
  mergeLlmIntoAnalysisReport,
  parseLlmDesignResponse
} from "../src/llm-design.js";
import { localLlmConfig, OpenAiCompatibleLlmProvider } from "../src/llm-provider.js";
import { evaluateQuality } from "../src/quality.js";

test("local LLM defaults to Gemma MLX model id from knowledge paths", () => {
  const config = localLlmConfig({ DIG_LLM_ENABLED: "false" });
  assert.equal(config.enabled, false);
  assert.match(config.model, /gemma-4/);
});

test("OpenAI-compatible provider posts chat completions when enabled", async () => {
  const provider = new OpenAiCompatibleLlmProvider(
    { enabled: true, provider: "local", baseUrl: "http://local/v1", model: "gemma4", timeoutMs: 1000 },
    async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }))
  );
  assert.equal((await provider.complete([{ role: "user", content: "hi" }])).content, "ok");
});

test("normalizes alias categories such as typography into visual_style", () => {
  const llm = parseLlmDesignResponse(
    JSON.stringify({
      design_summary: "Type-led page",
      hypotheses: [
        {
          category: "typography",
          value: "system sans with serif body",
          confidence: 0.6,
          rationale: "Measured font tokens",
          evidence_refs: ["Times New Roman"]
        }
      ]
    }),
    "gemma4",
    "http://127.0.0.1:11434/v1"
  );
  assert.equal(llm.hypotheses[0]?.category, "visual_style");
});

test("parses and merges Gemma design JSON into the analysis report", () => {
  const report = deriveAnalysisReport({
    logical_elements: [],
    transformations: [],
    geometry_layouts: [],
    ontologies: [],
    visual_language: [],
    visual_hypotheses: [],
    quality: evaluateQuality({
      subsystem_success: 1,
      geometry_coverage: 1,
      style_coverage: 1,
      screenshot_completeness: 1,
      accessibility_coverage: 1,
      asset_completeness: 1,
      font_completeness: 1,
      network_completion: 1,
      state_restoration: 1,
      scroll_restoration: 1
    })
  });
  const llm = parseLlmDesignResponse(
    JSON.stringify({
      design_summary: "Sparse marketing content page with restrained typography.",
      hypotheses: [
        {
          category: "page_archetype",
          value: "content landing",
          confidence: 0.71,
          rationale: "Heading plus body and a single link.",
          evidence_refs: ["dig:content.heading"]
        },
        {
          category: "visual_style",
          value: "restrained monochrome",
          confidence: 0.66,
          rationale: "Few colors and default system fonts.",
          evidence_refs: ["#000000ff"]
        }
      ]
    }),
    "gemma4",
    "http://127.0.0.1:11434/v1"
  );
  assert.equal(llm.status, "complete");
  assert.equal(llm.hypotheses.length, 2);
  const merged = mergeLlmIntoAnalysisReport(report, llm, "vpc_test");
  assert.equal(merged.stages.find((stage) => stage.kind === "llm")?.status, "complete");
  assert.equal(merged.llm_design?.hypothesis_count, 2);
  assert.ok(merged.semantic_inputs.some((item) => item.source === "llm"));
  assert.ok(buildDesignEvidencePrompt({
    canonical_url: "https://example.com/",
    ontologies: [],
    visual_language: [],
    visual_hypotheses: [],
    logical_element_count: 0,
    transformation_count: 0
  }).includes("example.com"));
});

test("buildDesignEvidencePrompt strips node_ids and stays compact on large viewports", () => {
  const nodeIds = Array.from({ length: 800 }, (_, index) => `node_${String(index).padStart(6, "0")}`);
  const prompt = buildDesignEvidencePrompt({
    canonical_url: "https://www.apple.de/",
    title: "Apple (Deutschland)",
    ontologies: [
      {
        viewport_name: "desktop",
        viewport_capture_id: "vpc_d",
        entities: Array.from({ length: 50 }, (_, index) => ({
          entity_id: `e${index}`,
          entity_type: "component",
          taxonomy_id: `dig:component.card`,
          label: `Card ${index}`,
          layer: "L2",
          confidence: 0.8,
          method: "heuristic",
          evidence: [],
          attributes: {}
        }))
      }
    ] as never,
    visual_language: [
      {
        viewport_capture_id: "vpc_d",
        typography: [
          {
            font_family: "SF Pro Text",
            font_size: "17px",
            font_weight: "400",
            line_height: "25px",
            letter_spacing: "-0.374px",
            occurrences: 540,
            node_ids: nodeIds
          }
        ],
        color_palette: [
          { hex: "#000000", roles: ["foreground"], occurrences: 1200, node_ids: nodeIds }
        ],
        shape: {
          border_radius_values: ["0px", "12px"],
          shadow_values: ["none"],
          border_width_values: ["0px", "1px"]
        }
      }
    ] as never,
    visual_hypotheses: [],
    logical_element_count: 400,
    transformation_count: 80
  });
  assert.equal(prompt.includes("node_000001"), false);
  assert.ok(prompt.length < 8_000);
  assert.doesNotThrow(() => JSON.parse(prompt));
});
