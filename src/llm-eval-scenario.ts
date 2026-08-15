import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DesignEvidenceInput } from "./llm-design.js";
import type { EvalGolden } from "./llm-quality-score.js";
import type { TaxonomyId } from "./taxonomy.js";

export interface EvalScenario {
  id: string;
  title: string;
  canonical_url: string;
  page_html: string;
  screenshot: string;
  viewport: { width: number; height: number };
  evidence: {
    title: string;
    section_signature: string;
    section_category: string;
    text_signals: string[];
    ui_taxonomies: string[];
    typography: { font_family: string; font_size: string; font_weight: string };
    colors: Array<{ hex: string; roles: Array<"foreground" | "background" | "border" | "vector"> }>;
  };
  golden: EvalGolden;
}

export async function loadEvalScenario(scenarioDir: string): Promise<EvalScenario> {
  const scenario = JSON.parse(await readFile(resolve(scenarioDir, "scenario.json"), "utf8")) as EvalScenario;
  return scenario;
}

export function buildEvidenceFromScenario(scenario: EvalScenario): DesignEvidenceInput {
  const viewportId = "vpc_eval";
  const taxonomyLabel = (id: string) => id.split(".").at(-1) ?? id;
  const headingText = scenario.evidence.text_signals[0] ?? "Aurora Phone";
  const ctaText = scenario.evidence.text_signals[1] ?? "Learn more";
  const hexToRgba = (hex: string) => {
    const cleaned = hex.replace("#", "");
    const full = cleaned.length === 3 ? cleaned.split("").map((c) => `${c}${c}`).join("") : cleaned;
    const value = Number.parseInt(full.slice(0, 6), 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
      a: 1
    };
  };
  return {
    canonical_url: scenario.canonical_url,
    title: scenario.evidence.title,
    ontologies: [
      {
        ontology_version: "0.2.0",
        viewport_capture_id: viewportId,
        viewport_name: "desktop",
        page_entity_id: "page_eval",
        entities: [
          {
            ontology_entity_id: "ont_page",
            entity_type: "page",
            taxonomy_id: "dig:page.marketing_home",
            label: "Marketing Home",
            viewport_capture_id: viewportId,
            source_node_id: null,
            parent_entity_id: null,
            confidence: 0.85,
            method: "eval_fixture",
            layer: "L3",
            evidence: [],
            attributes: {}
          },
          ...scenario.evidence.ui_taxonomies.map((taxonomy_id, index) => ({
            ontology_entity_id: `ont_${index}`,
            entity_type: "component" as const,
            taxonomy_id: taxonomy_id as TaxonomyId,
            label: taxonomyLabel(taxonomy_id),
            viewport_capture_id: viewportId,
            source_node_id: `n_${index}`,
            parent_entity_id: null,
            confidence: 0.9,
            method: "eval_fixture",
            layer: "L2" as const,
            evidence: [],
            attributes: {}
          }))
        ],
        relationships: []
      }
    ],
    visual_language: [
      {
        viewport_capture_id: viewportId,
        viewport_name: "desktop",
        layer: "L2",
        typography: [
          {
            font_family: scenario.evidence.typography.font_family,
            font_size: scenario.evidence.typography.font_size,
            font_weight: scenario.evidence.typography.font_weight,
            line_height: "1.05",
            letter_spacing: "-0.03em",
            occurrences: 1,
            node_ids: ["n_heading"]
          }
        ],
        color_palette: scenario.evidence.colors.map((color, index) => ({
          hex: color.hex.length === 7 ? `${color.hex}ff` : color.hex,
          rgba: hexToRgba(color.hex),
          roles: color.roles,
          occurrences: 4,
          properties: color.roles.includes("background") ? ["background-color"] : ["color"],
          node_ids: [`n_color_${index}`]
        })),
        shape: {
          border_radius_values: [{ value: "18px", occurrences: 2 }],
          shadow_values: [],
          border_width_values: [{ value: "0px", occurrences: 3 }]
        },
        imagery: { total: 1, by_type: { image: 1 }, intrinsic_dimensioned: 1 },
        composition: { visible_node_count: 12, estimated_box_coverage: 0.8, document_aspect_ratio: 1.6 },
        motion: {
          total: 0,
          declarations: 0,
          runtime_instances: 0,
          by_source: {},
          compositor_friendly_runtime_instances: 0,
          animated_properties: []
        },
        provenance: { method: "computed_styles_and_measured_assets", confidence: 1 }
      }
    ],
    visual_hypotheses: [],
    logical_element_count: 8,
    transformation_count: 0,
    section_compositions: [
      {
        section_id: "sec_hero",
        viewport_capture_id: viewportId,
        viewport_name: "desktop",
        root_node_id: "n_hero",
        taxonomy_id: "dig:section.hero_media_above",
        category: scenario.evidence.section_category,
        confidence: 0.92,
        method: "eval_fixture",
        recipe: [
          { kind: "role", role: "media_large", node_id: "n_media", box: { x: 64, y: 80, width: 720, height: 360 } },
          { kind: "gap", gap_px: 24 },
          {
            kind: "role",
            role: "heading",
            node_id: "n_heading",
            text_preview: headingText,
            box: { x: 64, y: 464, width: 480, height: 64 }
          },
          { kind: "gap", gap_px: 16 },
          {
            kind: "role",
            role: "cta",
            node_id: "n_cta",
            text_preview: ctaText,
            box: { x: 64, y: 544, width: 140, height: 44 }
          }
        ],
        signature: scenario.evidence.section_signature,
        text_signals: scenario.evidence.text_signals,
        layer: "L2"
      }
    ],
    section_clusters: [
      {
        signature: scenario.evidence.section_signature,
        category: scenario.evidence.section_category,
        taxonomy_id: "dig:section.hero_media_above",
        count: 1,
        viewport_names: ["desktop"],
        example_text_signals: scenario.evidence.text_signals
      }
    ]
  };
}

export const VISION_SCREEN_PROMPT = `You are scoring a marketing webpage screenshot for DIG.
The image may be a full-page capture (tall) or a single viewport — read the whole image.
Return ONLY minified JSON (no markdown, no trailing commas):
{"heading":string,"cta":string,"layout_order":["media"|"heading"|"cta"|"other"],"notes":string,"confidence":number}
Rules:
- heading = main hero headline text visible near the top of the page
- cta = primary call-to-action button/link text in the hero
- layout_order = top-to-bottom order of the main hero blocks
- notes = brief page-wide composition cues (e.g. full-bleed media bands, repeated product modules)
- confidence in (0,1)`;
