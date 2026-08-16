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

/** Legacy compact hero score — still used by quality-eval scripts. */
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

/** Run A — compact visual catalog (keep small for Flash VL). */
export const VISION_PAGE_PROMPT = `You catalog the VISUAL SYSTEM of a DESKTOP marketing webpage screenshot for DIG.
Return ONLY minified JSON (no markdown, no trailing commas):
{"page_type":string,"overall_atmosphere":string,"color_mood":string,"typography_feel":string,"above_the_fold":string,"vertical_rhythm":string,"media_strategy":string,"notable_modules":string[],"brand_cues":string,"interaction_chrome":string,"category_tags":string[],"rebuild_hints":string,"heading":string,"cta":string,"layout_order":["media"|"heading"|"cta"|"other"],"confidence":number}
Rules:
- Be concrete and pixel-grounded; do not invent unread text.
- above_the_fold: 2 sentences max. rebuild_hints: 2 sentences max.
- notable_modules / category_tags: up to 6 items each.
- heading / cta / layout_order: hero-level facts only.
- confidence in (0,1).`;

/** Run A2 — whole-page UX/layout (TEXT ONLY; grounded on visual catalog + bands). */
export const VISION_PAGE_UX_PROMPT = `You are a product UX analyst for DIG. Given a VISUAL CATALOG JSON and FULL-WIDTH SECTION BANDS from the same page, assess whole-page UX and layout.
Return ONLY minified JSON (no markdown, no trailing commas):
{"layout_system":string,"spacing_feel":string,"alignment":string,"above_fold_job":string,"ux_flow":string[],"ux_strengths":string[],"ux_risks":string[],"confidence":number}
Rules:
- Use ONLY the provided evidence; do not invent sections not listed in bands.
- layout_system: e.g. full-bleed stacks / split columns / card grid / mixed.
- spacing_feel: tight|airy|uneven + one short cue.
- alignment: left|centered|mixed.
- above_fold_job: one sentence on what the first screen must achieve.
- ux_flow: 3-6 short beats top→bottom matching the bands.
- ux_strengths / ux_risks: up to 4 short items each (hierarchy, CTA clarity, clutter, contrast, scroll length).
- confidence in (0,1).`;

export const VISION_SECTION_PROMPT = `You describe ONE cropped web DESIGN SECTION screenshot for DIG in rich visual detail.
Return ONLY minified JSON (no markdown, no trailing commas):
{"visible_text":string[],"media_subject":string,"atmosphere":string,"overlay":string,"cta_chrome":string,"composition":string,"confidence":number}
Rules:
- Use ONLY what is visible in THIS crop; do not invent off-crop UI.
- visible_text: up to 6 short strings actually readable in the crop (headlines, CTAs, labels).
- media_subject: what the image/video shows (car, product, people, abstract, none) — be specific.
- atmosphere: lighting/contrast/mood tied to pixels (e.g. dark scrim over night photo).
- overlay: gradient/scrim/none and where it sits.
- cta_chrome: button/link styling if present, else "".
- composition: 2-3 sentences on layout inside the crop (alignment, stack, negative space, type scale).
- confidence in (0,1).`;

export const VISION_LAYOUT_PROMPT = `You segment a marketing webpage screenshot into FULL-WIDTH vertical PAGE SECTIONS for DIG.
The image may be a full page (tall) or one viewport, or a vertical TILE of a taller page.
Return ONLY minified JSON (no markdown, no trailing commas):
{"bands":[{"id":string,"label":string,"category":"hero"|"nav"|"feature"|"content"|"commerce"|"conversion"|"social_proof"|"footer"|"other","box":{"x":0,"y":number,"width":1,"height":number},"confidence":number}],"notes":string}
Rules:
- EVERY band MUST be a full-bleed horizontal strip of the page: box.x MUST be 0 and box.width MUST be 1. Never crop left/right.
- Do NOT mark buttons, CTAs, cards, columns, logos, or text blocks as their own bands — those are details inside a band (analyzed later).
- A band = one major page region stacked top→bottom (nav, hero, intro copy, case-study row, insights row, CTA banner, footer).
- Top-to-bottom order; cover the page story without tiny fragments. Prefer 4–8 bands. At most ONE hero.
- Skip cookie/CMP dialogs and chat widgets.
- label = short human name for the WHOLE band (e.g. "Hero", "Case studies", "Insights", "Footer").
- category = best fit for the band.
- confidence in (0,1).
- notes = one sentence on overall page rhythm.`;
