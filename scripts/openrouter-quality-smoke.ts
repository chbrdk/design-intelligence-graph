#!/usr/bin/env node
/**
 * Live OpenRouter quality smoke for DIG staged design analysis.
 * Loads OPENROUTER_API_KEY from .env (never prints the key).
 *
 * Usage:
 *   node --import tsx scripts/openrouter-quality-smoke.ts
 *   DIG_OR_MODELS=nvidia/nemotron-3-nano-30b-a3b:free,nvidia/nemotron-3-super-120b-a12b:free npm run llm:openrouter-smoke
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeDesignWithLlm, type DesignEvidenceInput } from "../src/llm-design.js";
import { OpenAiCompatibleLlmProvider, type LlmProviderConfig } from "../src/llm-provider.js";
import { loadDigPaths } from "../src/runtime-paths.js";

async function loadEnvFile(root: string): Promise<Record<string, string>> {
  const raw = await readFile(resolve(root, ".env"), "utf8").catch(() => "");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function fixtureEvidence(): DesignEvidenceInput {
  return {
    canonical_url: "https://www.apple.de/",
    title: "Apple (Deutschland)",
    ontologies: [
      {
        ontology_version: "0.2.0",
        viewport_capture_id: "vpc_desktop",
        viewport_name: "desktop",
        page_entity_id: "page_1",
        entities: [
          {
            ontology_entity_id: "ont_page",
            entity_type: "page",
            taxonomy_id: "dig:page.marketing_home",
            label: "Marketing Home",
            viewport_capture_id: "vpc_desktop",
            source_node_id: null,
            parent_entity_id: null,
            confidence: 0.8,
            method: "fixture",
            layer: "L3",
            evidence: [],
            attributes: {}
          },
          {
            ontology_entity_id: "ont_btn",
            entity_type: "component",
            taxonomy_id: "dig:component.button",
            label: "Button",
            viewport_capture_id: "vpc_desktop",
            source_node_id: "n_cta",
            parent_entity_id: null,
            confidence: 0.95,
            method: "fixture",
            layer: "L2",
            evidence: [],
            attributes: { text: "Weitere Infos" }
          },
          {
            ontology_entity_id: "ont_nav",
            entity_type: "component",
            taxonomy_id: "dig:component.navigation",
            label: "Navigation",
            viewport_capture_id: "vpc_desktop",
            source_node_id: "n_nav",
            parent_entity_id: null,
            confidence: 0.9,
            method: "fixture",
            layer: "L2",
            evidence: [],
            attributes: {}
          },
          {
            ontology_entity_id: "ont_media",
            entity_type: "component",
            taxonomy_id: "dig:component.media",
            label: "Media",
            viewport_capture_id: "vpc_desktop",
            source_node_id: "n_media",
            parent_entity_id: null,
            confidence: 0.9,
            method: "fixture",
            layer: "L2",
            evidence: [],
            attributes: {}
          },
          {
            ontology_entity_id: "ont_h1",
            entity_type: "content",
            taxonomy_id: "dig:content.heading",
            label: "Heading",
            viewport_capture_id: "vpc_desktop",
            source_node_id: "n_h1",
            parent_entity_id: null,
            confidence: 0.95,
            method: "fixture",
            layer: "L2",
            evidence: [],
            attributes: { text: "iPhone" }
          }
        ],
        relationships: []
      }
    ],
    visual_language: [
      {
        viewport_capture_id: "vpc_desktop",
        viewport_name: "desktop",
        layer: "L2",
        typography: [
          {
            font_family: "SF Pro Display",
            font_size: "56px",
            font_weight: "600",
            line_height: "1.1",
            letter_spacing: "-0.02em",
            occurrences: 4,
            node_ids: ["n_h1"]
          }
        ],
        color_palette: [
          { hex: "#f5f5f7", roles: ["background"], occurrences: 12, properties: ["background-color"] },
          { hex: "#1d1d1f", roles: ["foreground"], occurrences: 20, properties: ["color"] },
          { hex: "#0071e3", roles: ["foreground"], occurrences: 6, properties: ["color"] }
        ],
        shape: {
          border_radius_values: [{ value: "18px", occurrences: 8 }],
          shadow_values: [],
          border_width_values: [{ value: "0px", occurrences: 10 }]
        },
        imagery: { total: 9, by_type: { image: 8, video: 1 }, intrinsic_dimensioned: 8 },
        composition: { visible_node_count: 420, estimated_box_coverage: 0.7, document_aspect_ratio: 0.55 },
        motion: { css_animation_count: 2, web_animation_count: 0, transition_property_count: 4 },
        provenance: { method: "computed_styles_and_measured_assets", confidence: 1 }
      }
    ],
    visual_hypotheses: [],
    logical_element_count: 48,
    transformation_count: 6,
    section_compositions: [
      {
        section_id: "sec_hero",
        viewport_capture_id: "vpc_desktop",
        viewport_name: "desktop",
        root_node_id: "n_hero",
        taxonomy_id: "dig:section.hero_media_above",
        category: "hero",
        confidence: 0.88,
        method: "fixture",
        recipe: [
          { kind: "role", role: "media_large", node_id: "n_media", box: { x: 0, y: 0, width: 1440, height: 720 } },
          { kind: "gap", gap_px: 24 },
          { kind: "role", role: "heading", node_id: "n_h1", text_preview: "iPhone", box: { x: 120, y: 760, width: 400, height: 64 } },
          { kind: "gap", gap_px: 16 },
          { kind: "role", role: "cta", node_id: "n_cta", text_preview: "Weitere Infos", box: { x: 120, y: 840, width: 160, height: 44 } }
        ],
        signature: "media>heading>cta",
        text_signals: ["iPhone", "Weitere Infos"],
        layer: "L2"
      },
      {
        section_id: "sec_grid",
        viewport_capture_id: "vpc_desktop",
        viewport_name: "desktop",
        root_node_id: "n_grid",
        taxonomy_id: "dig:section.product_grid",
        category: "product_grid",
        confidence: 0.7,
        method: "fixture",
        recipe: [
          { kind: "role", role: "heading", node_id: "n_h2", text_preview: "Zubehör", box: { x: 80, y: 980, width: 300, height: 40 } },
          { kind: "gap", gap_px: 20 },
          { kind: "role", role: "media", node_id: "n_card", box: { x: 80, y: 1040, width: 300, height: 200 } }
        ],
        signature: "heading>media",
        text_signals: ["Zubehör"],
        layer: "L2"
      }
    ],
    section_clusters: [
      {
        signature: "media>heading>cta",
        category: "hero",
        taxonomy_id: "dig:section.hero_media_above",
        count: 3,
        viewport_names: ["desktop", "tablet"],
        example_text_signals: ["iPhone", "MacBook"]
      }
    ]
  };
}

function scoreAnalysis(result: Awaited<ReturnType<typeof analyzeDesignWithLlm>>): Record<string, unknown> {
  const mobbin = result.mobbin;
  return {
    status: result.status,
    error: result.error ?? null,
    analysis_mode: result.analysis_mode,
    design_summary_chars: result.design_summary?.length ?? 0,
    design_summary_preview: (result.design_summary ?? "").slice(0, 280),
    hypothesis_count: result.hypotheses?.length ?? 0,
    screen_patterns: mobbin?.screen_patterns?.map((item) => item.name) ?? [],
    ui_elements: mobbin?.ui_elements?.map((item) => item.name) ?? [],
    recipe_insights: mobbin?.recipe_insights?.map((item) => ({
      signature: item.signature,
      category: item.category,
      interpretation: item.interpretation.slice(0, 160)
    })) ?? [],
    page_flow: mobbin?.page_flow ?? [],
    visual_style_labels: mobbin?.visual_style_labels?.map((item) => item.name) ?? [],
    mentions_media_heading_cta: /media.*heading.*cta|heading.*cta|media>heading>cta/i.test(
      JSON.stringify(mobbin ?? {})
    ),
    mentions_apple_or_hero: /apple|hero|iphone|marketing/i.test(
      `${result.design_summary}\n${JSON.stringify(mobbin ?? {})}`
    )
  };
}

async function runModel(model: string, apiKey: string, evidence: DesignEvidenceInput) {
  const paths = loadDigPaths();
  const openrouter = paths.llm.openrouter;
  const config: LlmProviderConfig = {
    enabled: true,
    provider: "openrouter",
    baseUrl: openrouter?.baseUrl ?? "https://openrouter.ai/api/v1",
    model,
    timeoutMs: Number(process.env.DIG_LLM_TIMEOUT_MS ?? "180000"),
    stagedAnalysis: true,
    stageMaxTokens: Number(process.env.DIG_LLM_STAGE_MAX_TOKENS ?? "700"),
    apiKey,
    headers: {
      ...(openrouter?.httpReferer ? { "HTTP-Referer": openrouter.httpReferer } : {}),
      ...(openrouter?.appTitle ? { "X-Title": openrouter.appTitle } : { "X-Title": "DIG-quality-smoke" })
    }
  };
  const started = Date.now();
  const provider = new OpenAiCompatibleLlmProvider(config);
  const result = await analyzeDesignWithLlm(evidence, { config, provider });
  return {
    model,
    elapsed_ms: Date.now() - started,
    score: scoreAnalysis(result),
    raw_status: result.status,
    stages: result.stages ?? []
  };
}

async function main(): Promise<void> {
  const root = process.cwd();
  const fileEnv = await loadEnvFile(root);
  const apiKey = process.env.OPENROUTER_API_KEY || fileEnv.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY in env or .env");
    process.exit(1);
  }

  const defaults = [
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-3-super-120b-a12b:free"
  ];
  const models = (process.env.DIG_OR_MODELS ?? defaults.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const evidence = fixtureEvidence();
  const outDir = resolve(root, "tmp/openrouter-quality");
  await mkdir(outDir, { recursive: true });

  console.log(`OpenRouter quality smoke · ${models.length} model(s)`);
  const reports = [];
  for (const model of models) {
    console.log(`\n→ ${model}`);
    try {
      const report = await runModel(model, apiKey, evidence);
      reports.push(report);
      console.log(
        JSON.stringify(
          {
            status: report.raw_status,
            elapsed_ms: report.elapsed_ms,
            patterns: report.score.screen_patterns,
            recipes: report.score.recipe_insights,
            flow: report.score.page_flow,
            summary: report.score.design_summary_preview,
            mentions_recipe: report.score.mentions_media_heading_cta,
            mentions_brand_or_hero: report.score.mentions_apple_or_hero
          },
          null,
          2
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reports.push({ model, error: message });
      console.error(`  failed: ${message}`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `smoke-${stamp}.json`);
  await writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), reports }, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
