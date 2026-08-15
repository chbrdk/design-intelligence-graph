import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCosts, estimateUsd, usageToStageCost } from "../src/llm-cost.js";
import { MemoryLlmStageCache } from "../src/llm-stage-cache.js";
import { OpenAiCompatibleLlmProvider } from "../src/llm-provider.js";
import { analyzeDesignWithLlm } from "../src/llm-design.js";
import { PARALLEL_TEXT_STAGES } from "../src/llm-stages.js";
import { findSettledScreenshot, visionEnabled } from "../src/llm-vision.js";
import type { CaptureManifest } from "../src/types.js";

test("estimateUsd uses known model rates and free tiers", () => {
  assert.equal(estimateUsd("nvidia/nemotron-3-nano:free", 1000, 1000), 0);
  const qwen = estimateUsd("qwen/qwen3.7-flash", 1_000_000, 1_000_000);
  assert.ok(qwen !== null && qwen > 0);
});

test("aggregateCosts sums stage telemetry", () => {
  const summary = aggregateCosts([
    usageToStageCost("screen_patterns", "qwen/qwen3.7-flash", { prompt_tokens: 100, completion_tokens: 50 }, false),
    usageToStageCost("vision_screen", "qwen/qwen3.7-flash", { prompt_tokens: 200, completion_tokens: 20, cost: 0.001 }, false)
  ]);
  assert.equal(summary.prompt_tokens, 300);
  assert.equal(summary.completion_tokens, 70);
  assert.equal(summary.by_stage.length, 2);
});

test("parallel text stages run concurrently then synthesize", async () => {
  const previousQuality = process.env.DIG_LLM_QUALITY_MODEL;
  process.env.DIG_LLM_QUALITY_MODEL = "gemma4";
  const started: string[] = [];
  const responses: Record<string, string> = {
    screen_patterns: JSON.stringify({
      screen_patterns: [{ name: "Marketing Home", confidence: 0.8, evidence_refs: ["dig:section.hero"] }]
    }),
    ui_elements: JSON.stringify({
      ui_elements: [{ name: "Button", confidence: 0.9, evidence_refs: ["dig:component.button"] }]
    }),
    section_recipes: JSON.stringify({
      recipe_insights: [
        { signature: "media>heading>cta", interpretation: "Media then headline then CTA", evidence_refs: ["sig"] }
      ],
      page_flow: [{ step: 1, section_label: "Hero", signature: "media>heading>cta" }]
    }),
    visual_style: JSON.stringify({
      visual_style_labels: [{ name: "High contrast", confidence: 0.7, evidence_refs: ["#000"] }]
    }),
    synthesize: JSON.stringify({
      design_summary: "Marketing homepage with media-led hero stacks.",
      hypotheses: [
        {
          category: "page_archetype",
          value: "marketing home",
          confidence: 0.8,
          rationale: "Hero recipe and screen pattern",
          evidence_refs: ["Marketing Home"]
        }
      ]
    })
  };
  let inFlight = 0;
  let maxInFlight = 0;
  const provider = new OpenAiCompatibleLlmProvider(
    {
      enabled: true,
      provider: "local",
      baseUrl: "http://local/v1",
      model: "gemma4",
      timeoutMs: 2000,
      stagedAnalysis: true,
      stageMaxTokens: 400
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content: string }> };
      const blob = body.messages?.map((message) => message.content).join("\n") ?? "";
      const stage =
        PARALLEL_TEXT_STAGES.find((id) => blob.includes(`Stage=${id}`)) ??
        (blob.includes("Stage=synthesize") || blob.includes("synthesize") ? "synthesize" : "unknown");
      started.push(stage);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      const content = responses[stage] ?? responses.synthesize!;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00001 }
        })
      );
    }
  );

  try {
    const result = await analyzeDesignWithLlm(
      {
        canonical_url: "https://example.com/",
        ontologies: [],
        visual_language: [],
        visual_hypotheses: [],
        logical_element_count: 0,
        transformation_count: 0,
        section_compositions: []
      },
      {
        config: {
          enabled: true,
          provider: "local",
          baseUrl: "http://local/v1",
          model: "gemma4",
          timeoutMs: 2000,
          stagedAnalysis: true,
          stageMaxTokens: 400
        },
        provider,
        stageCache: new MemoryLlmStageCache()
      }
    );
    assert.equal(result.status, "complete");
    assert.ok(maxInFlight >= 2, `expected parallel fan-out, got maxInFlight=${maxInFlight}`);
    assert.equal(result.stages?.[0]?.stage_id, "screen_patterns");
    assert.equal(result.stages?.at(-1)?.stage_id, "synthesize");
    assert.ok((result.cost?.prompt_tokens ?? 0) >= 50);
  } finally {
    if (previousQuality === undefined) delete process.env.DIG_LLM_QUALITY_MODEL;
    else process.env.DIG_LLM_QUALITY_MODEL = previousQuality;
  }
});

test("vision helpers respect env and screenshot artifact path", () => {
  assert.equal(visionEnabled({ DIG_LLM_VISION: "false" }), false);
  assert.equal(visionEnabled({ DIG_LLM_VISION: "true" }), true);
  const path = findSettledScreenshot("/tmp/pkg", {
    viewport_captures: [
      {
        name: "desktop",
        artifacts: { viewport_screenshot: { path: "viewports/desktop/screenshots/settled.webp" } }
      }
    ]
  } as unknown as CaptureManifest);
  assert.equal(path, "/tmp/pkg/viewports/desktop/screenshots/settled.webp");
});
