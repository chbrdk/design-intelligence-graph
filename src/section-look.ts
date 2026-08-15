import type { SectionComposition } from "./section-composition.js";
import { loadDigPaths } from "./runtime-paths.js";

export const SECTION_LOOK_VERSION = "0.1.0";

const STYLE_ALLOWLIST = [
  "background-image",
  "background-color",
  "box-shadow",
  "font-style",
  "font-weight",
  "font-size",
  "font-family",
  "text-align",
  "text-decoration-line",
  "opacity",
  "filter",
  "backdrop-filter",
  "object-fit",
  "justify-content",
  "align-items",
  "border-radius",
  "color"
] as const;

export type SectionLookDescription = {
  section_id: string;
  signature: string;
  category?: string;
  stack_summary: string;
  background?: {
    kind: "solid" | "image" | "gradient" | "video" | "none";
    treatment?: string;
  };
  overlay?: {
    present: boolean;
    kind?: "gradient" | "scrim" | "blur" | "other";
    notes?: string;
  };
  shadows?: {
    present: boolean;
    targets?: Array<"card" | "cta" | "text" | "container">;
    notes?: string;
  };
  typography_emphasis?: Array<"italic" | "bold" | "underline" | "all_caps" | "tight_tracking">;
  alignment?: {
    text?: "left" | "center" | "right";
    cta?: "left" | "center" | "right" | "full_width";
  };
  media?: {
    role: "background" | "hero" | "inline" | "none";
    object_fit?: string;
    notes?: string;
  };
  look_summary: string;
  interaction_summary?: string;
  confidence: number;
  evidence_refs: string[];
};

export type NodeStyleMap = Record<string, Record<string, string>>;

export function sectionLookMaxSections(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_LLM_SECTION_LOOK_MAX);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return Math.floor(fromEnv);
  const paths = loadDigPaths();
  const fromPaths = Number(paths.llm.scaling?.sectionLookMaxSections ?? 8);
  return Number.isFinite(fromPaths) && fromPaths >= 0 ? Math.floor(fromPaths) : 8;
}

/** Prefer hero / above-fold / high-confidence sections with CTA or media. */
export function selectSectionsForLook(
  sections: SectionComposition[],
  maxSections = sectionLookMaxSections()
): SectionComposition[] {
  if (maxSections <= 0 || !sections.length) return [];
  const scored = sections.map((section, index) => {
    let score = section.confidence;
    const category = section.category.toLowerCase();
    if (category.includes("hero")) score += 2;
    if (category.includes("cta") || category.includes("pricing")) score += 0.8;
    if (section.signature.includes("media")) score += 0.6;
    if (section.signature.includes("cta")) score += 0.5;
    if (index < 3) score += 0.4;
    return { section, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const seen = new Set<string>();
  const picked: SectionComposition[] = [];
  for (const item of scored) {
    if (seen.has(item.section.section_id)) continue;
    seen.add(item.section.section_id);
    picked.push(item.section);
    if (picked.length >= maxSections) break;
  }
  return picked;
}

function pickStyles(properties: Record<string, string> | undefined): Record<string, string> {
  if (!properties) return {};
  const out: Record<string, string> = {};
  for (const key of STYLE_ALLOWLIST) {
    const value = properties[key];
    if (!value || value === "none" || value === "normal" || value === "auto") continue;
    if (key === "opacity" && (value === "1" || value === "1.0")) continue;
    if (key === "background-color" && (value === "rgba(0, 0, 0, 0)" || value === "transparent")) continue;
    out[key] = value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }
  return out;
}

function roleSteps(section: SectionComposition) {
  return section.recipe.filter(
    (step): step is Extract<(typeof section.recipe)[number], { kind: "role" }> => step.kind === "role"
  );
}

function centeringHint(
  section: SectionComposition,
  step: { box: { x: number; y: number; width: number; height: number } }
): "left" | "center" | "right" | "unknown" {
  const roles = roleSteps(section);
  const frame = roles[0]?.box ?? step.box;
  if (!frame.width) return "unknown";
  const mid = step.box.x + step.box.width / 2;
  const left = frame.x;
  const right = frame.x + frame.width;
  const rel = (mid - left) / Math.max(1, right - left);
  if (rel < 0.35) return "left";
  if (rel > 0.65) return "right";
  return "center";
}

export function buildSectionLookEvidence(
  section: SectionComposition,
  nodeStyles: NodeStyleMap,
  priors?: { url?: string; title?: string | null; page_style_labels?: string[] }
): string {
  const roles = roleSteps(section).slice(0, 10).map((step) => ({
    role: step.role,
    node_id: step.node_id,
    text_preview: step.text_preview?.slice(0, 80) ?? null,
    alignment_hint: centeringHint(section, step),
    styles: pickStyles(nodeStyles[step.node_id])
  }));

  const rootStyles = pickStyles(nodeStyles[section.root_node_id]);
  const gaps = section.recipe
    .filter((step): step is { kind: "gap"; gap_px: number } => step.kind === "gap")
    .map((step) => step.gap_px)
    .slice(0, 8);

  return JSON.stringify({
    url: priors?.url ?? null,
    title: priors?.title ?? null,
    page_style_labels: priors?.page_style_labels?.slice(0, 4) ?? [],
    section: {
      section_id: section.section_id,
      category: section.category,
      taxonomy_id: section.taxonomy_id,
      signature: section.signature,
      confidence: section.confidence,
      text_signals: section.text_signals.slice(0, 4),
      gaps_px: gaps,
      root_styles: rootStyles,
      roles
    }
  });
}

function clampConfidence(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0.55;
  return Math.min(0.95, Math.max(0.05, number));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 12) : [];
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Section look response did not contain a JSON object");
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(slice.replace(/,\s*([\]}])/g, "$1"));
  }
}

export function parseSectionLookResponse(
  raw: string,
  fallback: { section_id: string; signature: string; category?: string }
): SectionLookDescription | null {
  const parsed = extractJsonObject(raw) as Record<string, unknown>;
  const look_summary = String(parsed.look_summary ?? "").trim();
  const stack_summary = String(parsed.stack_summary ?? "").trim();
  if (!look_summary && !stack_summary) return null;

  const background =
    parsed.background && typeof parsed.background === "object"
      ? (parsed.background as SectionLookDescription["background"])
      : undefined;
  const overlay =
    parsed.overlay && typeof parsed.overlay === "object"
      ? (parsed.overlay as SectionLookDescription["overlay"])
      : undefined;
  const shadows =
    parsed.shadows && typeof parsed.shadows === "object"
      ? (parsed.shadows as SectionLookDescription["shadows"])
      : undefined;
  const media =
    parsed.media && typeof parsed.media === "object"
      ? (parsed.media as SectionLookDescription["media"])
      : undefined;
  const alignment =
    parsed.alignment && typeof parsed.alignment === "object"
      ? (parsed.alignment as SectionLookDescription["alignment"])
      : undefined;

  return {
    section_id: String(parsed.section_id ?? fallback.section_id),
    signature: String(parsed.signature ?? fallback.signature),
    ...(typeof parsed.category === "string"
      ? { category: parsed.category }
      : fallback.category
        ? { category: fallback.category }
        : {}),
    stack_summary: stack_summary || look_summary.slice(0, 120),
    ...(background ? { background } : {}),
    ...(overlay ? { overlay } : {}),
    ...(shadows ? { shadows } : {}),
    ...(Array.isArray(parsed.typography_emphasis)
      ? {
          typography_emphasis: parsed.typography_emphasis
            .map(String)
            .filter((item): item is NonNullable<SectionLookDescription["typography_emphasis"]>[number] =>
              ["italic", "bold", "underline", "all_caps", "tight_tracking"].includes(item)
            )
        }
      : {}),
    ...(alignment ? { alignment } : {}),
    ...(media ? { media } : {}),
    look_summary: look_summary || stack_summary,
    ...(typeof parsed.interaction_summary === "string" && parsed.interaction_summary.trim()
      ? { interaction_summary: parsed.interaction_summary.trim().slice(0, 240) }
      : {}),
    confidence: clampConfidence(parsed.confidence),
    evidence_refs: asStringArray(parsed.evidence_refs)
  };
}

export const SECTION_LOOK_SYSTEM_PROMPT = `You describe how a measured web DESIGN SECTION looks and works.
Return ONLY a single minified JSON object (no markdown, no trailing commas):
{"section_id":string,"signature":string,"category":string,"stack_summary":string,"background":{"kind":"solid"|"image"|"gradient"|"video"|"none","treatment":string},"overlay":{"present":boolean,"kind":"gradient"|"scrim"|"blur"|"other","notes":string},"shadows":{"present":boolean,"targets":["card"|"cta"|"text"|"container"],"notes":string},"typography_emphasis":["italic"|"bold"|"underline"|"all_caps"|"tight_tracking"],"alignment":{"text":"left"|"center"|"right","cta":"left"|"center"|"right"|"full_width"},"media":{"role":"background"|"hero"|"inline"|"none","object_fit":string,"notes":string},"look_summary":string,"interaction_summary":string,"confidence":number,"evidence_refs":string[]}
Rules:
- Use ONLY provided CSS/recipe evidence; do not invent unseen UI.
- look_summary: 1-2 sentences on atmosphere and composition (e.g. full-bleed photo, dark gradient scrim, centered CTA, italic highlight, drop shadow).
- stack_summary: short role chain in reading order.
- Prefer concrete treatments over vague adjectives.
- confidence in (0,1); cite node_ids / css props in evidence_refs.`;

export function sectionLookUserPrompt(evidenceJson: string): string {
  return `Stage=section_look. Evidence JSON:\n${evidenceJson}\nReturn JSON only.`;
}
