import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDesignWithLlm } from "../src/llm-design.js";
import { OpenAiCompatibleLlmProvider } from "../src/llm-provider.js";
import {
  buildStageEvidence,
  parseRecipeStage,
  parseScreenPatterns,
  stageSystemPrompt
} from "../src/llm-stages.js";

test("stage evidence slices stay small and stage-specific", () => {
  const input = {
    canonical_url: "https://example.com/",
    title: "Example",
    ontologies: [{
      ontology_version: "0.2.0",
      viewport_capture_id: "vpc",
      viewport_name: "desktop",
      page_entity_id: "page",
      entities: [
        {
          ontology_entity_id: "c1",
          entity_type: "component" as const,
          taxonomy_id: "dig:component.button",
          label: "Button",
          viewport_capture_id: "vpc",
          source_node_id: "n1",
          parent_entity_id: "page",
          confidence: 0.9,
          method: "test",
          layer: "L2" as const,
          evidence: [],
          attributes: {}
        }
      ],
      relationships: []
    }],
    visual_language: [],
    visual_hypotheses: [],
    logical_element_count: 3,
    transformation_count: 1,
    section_compositions: [{
      section_id: "s1",
      viewport_capture_id: "vpc",
      viewport_name: "desktop",
      root_node_id: "hero",
      taxonomy_id: "dig:section.hero_media_above",
      category: "hero",
      confidence: 0.9,
      method: "test",
      recipe: [
        { kind: "role" as const, role: "media" as const, node_id: "img", box: { x: 0, y: 0, width: 1, height: 1 } },
        { kind: "gap" as const, gap_px: 40 },
        { kind: "role" as const, role: "heading" as const, node_id: "h1", text_preview: "Hello", box: { x: 0, y: 50, width: 1, height: 1 } },
        { kind: "gap" as const, gap_px: 12 },
        { kind: "role" as const, role: "cta" as const, node_id: "a", text_preview: "Buy", box: { x: 0, y: 70, width: 1, height: 1 } }
      ],
      signature: "media>heading>cta",
      text_signals: ["Hello", "Buy"],
      layer: "L2" as const
    }]
  };
  const recipes = JSON.parse(buildStageEvidence("section_recipes", input));
  assert.equal(recipes.sections[0].signature, "media>heading>cta");
  assert.deepEqual(recipes.sections[0].gaps, [40, 12]);
  const ui = JSON.parse(buildStageEvidence("ui_elements", input));
  assert.equal(ui.components[0].taxonomy_id, "dig:component.button");
  assert.match(stageSystemPrompt("screen_patterns"), /Mobbin/i);
});

test("parses staged Mobbin-like JSON payloads", () => {
  assert.equal(parseScreenPatterns('{"screen_patterns":[{"name":"Marketing Home","confidence":0.8,"evidence_refs":["dig:page.landing"]}]}')[0]?.name, "Marketing Home");
  const recipes = parseRecipeStage(JSON.stringify({
    recipe_insights: [{
      signature: "media>heading>cta",
      interpretation: "Large media above headline then CTA",
      category: "hero",
      gaps: [40, 12],
      evidence_refs: ["media>heading>cta"]
    }],
    page_flow: [{ step: 1, section_label: "Hero", signature: "media>heading>cta" }]
  }));
  assert.equal(recipes.recipe_insights[0]?.interpretation.includes("CTA"), true);
  assert.equal(recipes.page_flow[0]?.section_label, "Hero");
});

test("analyzeDesignWithLlm runs sequential stages by default", async () => {
  const previousQuality = process.env.DIG_LLM_QUALITY_MODEL;
  process.env.DIG_LLM_QUALITY_MODEL = "gemma4";
  const { MemoryLlmStageCache } = await import("../src/llm-stage-cache.js");
  const responses = [
    JSON.stringify({ screen_patterns: [{ name: "Marketing Home", confidence: 0.8, evidence_refs: ["dig:section.hero"] }] }),
    JSON.stringify({ ui_elements: [{ name: "Button", confidence: 0.9, evidence_refs: ["dig:component.button"] }] }),
    JSON.stringify({
      recipe_insights: [{ signature: "media>heading>cta", interpretation: "Media then headline then CTA", evidence_refs: ["sig"] }],
      page_flow: [{ step: 1, section_label: "Hero", signature: "media>heading>cta" }]
    }),
    JSON.stringify({ visual_style_labels: [{ name: "High contrast", confidence: 0.7, evidence_refs: ["#000"] }] }),
    JSON.stringify({
      design_summary: "Marketing homepage with media-led hero stacks.",
      hypotheses: [{
        category: "page_archetype",
        value: "marketing home",
        confidence: 0.8,
        rationale: "Hero recipe and screen pattern",
        evidence_refs: ["Marketing Home"]
      }]
    })
  ];
  let call = 0;
  const provider = new OpenAiCompatibleLlmProvider(
    { enabled: true, provider: "local", baseUrl: "http://local/v1", model: "gemma4", timeoutMs: 2000, stagedAnalysis: true, stageMaxTokens: 400 },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { max_tokens?: number; messages?: Array<{ content: string }> };
      assert.ok((body.max_tokens ?? 0) <= 900);
      assert.ok(body.messages?.some((message) => /Stage=/.test(message.content) || /synthesize|screen_patterns|Mobbin|section composition/i.test(message.content)));
      const content = responses[call] ?? responses.at(-1)!;
      call += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
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
        config: { enabled: true, provider: "local", baseUrl: "http://local/v1", model: "gemma4", timeoutMs: 2000, stagedAnalysis: true, stageMaxTokens: 400 },
        provider,
        stageCache: new MemoryLlmStageCache()
      }
    );

    assert.equal(result.status, "complete");
    assert.equal(result.analysis_mode, "staged");
    assert.equal(result.stages?.length, 5);
    assert.equal(result.mobbin?.screen_patterns[0]?.name, "Marketing Home");
    assert.equal(result.mobbin?.recipe_insights[0]?.signature, "media>heading>cta");
    assert.equal(result.hypotheses.length >= 1, true);
    assert.equal(call, 5);
  } finally {
    if (previousQuality === undefined) delete process.env.DIG_LLM_QUALITY_MODEL;
    else process.env.DIG_LLM_QUALITY_MODEL = previousQuality;
  }
});
