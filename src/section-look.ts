import type { SectionComposition } from "./section-composition.js";
import { loadDigPaths } from "./runtime-paths.js";

export const SECTION_LOOK_VERSION = "0.2.0";

const STYLE_ALLOWLIST = [
  "background-image",
  "background-color",
  "background-size",
  "background-position",
  "box-shadow",
  "text-shadow",
  "font-style",
  "font-weight",
  "font-size",
  "font-family",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-decoration-line",
  "text-transform",
  "opacity",
  "filter",
  "backdrop-filter",
  "object-fit",
  "object-position",
  "justify-content",
  "align-items",
  "align-content",
  "flex-direction",
  "flex-wrap",
  "gap",
  "row-gap",
  "column-gap",
  "display",
  "position",
  "inset",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "border",
  "border-radius",
  "border-color",
  "border-width",
  "padding",
  "padding-top",
  "padding-bottom",
  "margin",
  "margin-top",
  "margin-bottom",
  "max-width",
  "min-height",
  "overflow",
  "transform",
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
  /** Vertical rhythm / gutters between roles (from measured gaps + CSS). */
  spacing?: {
    gaps_px?: number[];
    notes?: string;
  };
  /** Layout mode cues derived from display/flex/grid CSS. */
  layout?: {
    mode?: string;
    notes?: string;
  };
  /** Short per-role callouts (role + concrete treatment). */
  role_notes?: Array<{ role: string; notes: string }>;
  /** Palette / contrast notes grounded in measured colors. */
  color_notes?: string;
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
  const fromPaths = Number(paths.llm.scaling?.sectionLookMaxSections ?? 14);
  return Number.isFinite(fromPaths) && fromPaths >= 0 ? Math.floor(fromPaths) : 14;
}

export function sectionLookMaxTokens(environment: NodeJS.ProcessEnv = process.env): number {
  const fromEnv = Number(environment.DIG_LLM_SECTION_LOOK_MAX_TOKENS);
  if (Number.isFinite(fromEnv) && fromEnv >= 200) return Math.floor(fromEnv);
  const paths = loadDigPaths();
  const fromPaths = Number(paths.llm.scaling?.sectionLookMaxTokens ?? 1200);
  return Number.isFinite(fromPaths) && fromPaths >= 200 ? Math.floor(fromPaths) : 1200;
}

/** Prefer hero / above-fold / high-confidence sections with CTA or media; diversify categories. */
export function selectSectionsForLook(
  sections: SectionComposition[],
  maxSections = sectionLookMaxSections()
): SectionComposition[] {
  if (maxSections <= 0 || !sections.length) return [];

  function sectionHeight(section: SectionComposition): number {
    const roles = roleSteps(section);
    if (!roles.length) return 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const step of roles) {
      minY = Math.min(minY, step.box.y);
      maxY = Math.max(maxY, step.box.y + step.box.height);
    }
    return Number.isFinite(minY) ? Math.max(0, maxY - minY) : 0;
  }

  function isPageWrapper(section: SectionComposition): boolean {
    const signature = section.signature;
    const thin = signature === "body" || signature === "unknown";
    const height = sectionHeight(section);
    return thin && height >= 2800;
  }

  const scored = sections.map((section, index) => {
    let score = section.confidence;
    const category = section.category.toLowerCase();
    if (category.includes("hero")) score += 2;
    if (category.includes("feature")) score += 1;
    if (category.includes("cta") || category.includes("conversion") || category.includes("pricing") || category.includes("commerce"))
      score += 0.8;
    if (category.includes("nav") || category.includes("form")) score += 0.5;
    if (section.signature.includes("media")) score += 0.6;
    if (section.signature.includes("cta")) score += 0.5;
    if (section.signature.includes("heading")) score += 0.35;
    if (index < 3) score += 0.4;
    // Soft-penalize repetitive social_proof so diverse pages don't fill the budget with marquees.
    if (category.includes("social_proof")) score -= 0.35;
    // Prefer richer stacks for granular description budget.
    const roleCount = section.signature.split(">").filter(Boolean).length;
    if (roleCount >= 3) score += 0.45;
    if (roleCount === 1 && (section.signature === "body" || section.signature === "unknown")) score -= 0.5;
    if (isPageWrapper(section)) score -= 2;
    return { section, score, index, skip: isPageWrapper(section) };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const seenIds = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const signatureCounts = new Map<string, number>();
  const picked: SectionComposition[] = [];
  const maxPerCategory = Math.max(2, Math.ceil(maxSections / 2.5));
  const maxPerSignature = Math.max(2, Math.ceil(maxSections / 5));

  function normalizeSignature(signature: string): string {
    return signature
      .split(">")
      .map((role) => (role === "media_large" ? "media" : role))
      .filter(Boolean)
      .join(">");
  }

  for (const item of scored) {
    if (item.skip) continue;
    if (seenIds.has(item.section.section_id)) continue;
    const category = item.section.category.toLowerCase() || "unknown";
    const signature = normalizeSignature(item.section.signature);
    if ((categoryCounts.get(category) ?? 0) >= maxPerCategory) continue;
    if ((signatureCounts.get(signature) ?? 0) >= maxPerSignature) continue;
    seenIds.add(item.section.section_id);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
    picked.push(item.section);
    if (picked.length >= maxSections) break;
  }

  // If diversity gates left the budget empty (all identical), fall back to score order.
  if (!picked.length) {
    for (const item of scored) {
      if (item.skip || seenIds.has(item.section.section_id)) continue;
      picked.push(item.section);
      if (picked.length >= maxSections) break;
    }
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
    if (key === "display" && value === "block") continue;
    out[key] = value.length > 220 ? `${value.slice(0, 217)}...` : value;
  }
  return out;
}

function roleSteps(section: SectionComposition) {
  return section.recipe.filter(
    (step): step is Extract<(typeof section.recipe)[number], { kind: "role" }> => step.kind === "role"
  );
}

function sectionFrame(section: SectionComposition): { x: number; y: number; width: number; height: number } | null {
  const roles = roleSteps(section);
  if (!roles.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const step of roles) {
    minX = Math.min(minX, step.box.x);
    minY = Math.min(minY, step.box.y);
    maxX = Math.max(maxX, step.box.x + step.box.width);
    maxY = Math.max(maxY, step.box.y + step.box.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function centeringHint(
  section: SectionComposition,
  step: { box: { x: number; y: number; width: number; height: number } }
): "left" | "center" | "right" | "unknown" {
  const frame = sectionFrame(section) ?? step.box;
  if (!frame.width) return "unknown";
  const mid = step.box.x + step.box.width / 2;
  const left = frame.x;
  const right = frame.x + frame.width;
  const rel = (mid - left) / Math.max(1, right - left);
  if (rel < 0.35) return "left";
  if (rel > 0.65) return "right";
  return "center";
}

function relativeBand(y: number, height: number): "above_fold" | "upper" | "mid" | "lower" {
  if (y <= 80) return "above_fold";
  if (y < 900) return "upper";
  if (y < 2400) return "mid";
  if (height > 0 && y > height) return "lower";
  return "lower";
}

export function buildSectionLookEvidence(
  section: SectionComposition,
  nodeStyles: NodeStyleMap,
  priors?: { url?: string; title?: string | null; page_style_labels?: string[]; viewport_height?: number }
): string {
  const roles = roleSteps(section).slice(0, 14).map((step) => ({
    role: step.role,
    node_id: step.node_id,
    text_preview: step.text_preview?.slice(0, 120) ?? null,
    box: {
      x: Math.round(step.box.x),
      y: Math.round(step.box.y),
      w: Math.round(step.box.width),
      h: Math.round(step.box.height)
    },
    alignment_hint: centeringHint(section, step),
    styles: pickStyles(nodeStyles[step.node_id])
  }));

  const rootStyles = pickStyles(nodeStyles[section.root_node_id]);
  const gaps = section.recipe
    .filter((step): step is { kind: "gap"; gap_px: number } => step.kind === "gap")
    .map((step) => step.gap_px)
    .slice(0, 12);
  const frame = sectionFrame(section);
  const viewportHeight = priors?.viewport_height ?? 900;

  return JSON.stringify({
    url: priors?.url ?? null,
    title: priors?.title ?? null,
    page_style_labels: priors?.page_style_labels?.slice(0, 4) ?? [],
    instruction:
      "Describe THIS section in fine detail from measured roles/CSS/geometry only. Cite concrete values (font-size, colors, gaps_px, box sizes).",
    section: {
      section_id: section.section_id,
      category: section.category,
      taxonomy_id: section.taxonomy_id,
      signature: section.signature,
      confidence: section.confidence,
      method: section.method,
      text_signals: section.text_signals.slice(0, 8),
      gaps_px: gaps,
      geometry: frame
        ? {
            x: Math.round(frame.x),
            y: Math.round(frame.y),
            w: Math.round(frame.width),
            h: Math.round(frame.height),
            band: relativeBand(frame.y, viewportHeight),
            viewport_height: viewportHeight
          }
        : null,
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

function asStringArray(value: unknown, max = 16): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, max) : [];
}

function asRoleNotes(value: unknown): Array<{ role: string; notes: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const notes = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = String(record.role ?? "").trim();
      const text = String(record.notes ?? "").trim();
      if (!role || !text) return null;
      return { role, notes: text.slice(0, 220) };
    })
    .filter((item): item is { role: string; notes: string } => Boolean(item))
    .slice(0, 10);
  return notes.length ? notes : undefined;
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
  fallback: { section_id: string; signature: string; category?: string; text_signals?: string[] }
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
  const spacing =
    parsed.spacing && typeof parsed.spacing === "object"
      ? (parsed.spacing as SectionLookDescription["spacing"])
      : undefined;
  const layout =
    parsed.layout && typeof parsed.layout === "object"
      ? (parsed.layout as SectionLookDescription["layout"])
      : undefined;
  const role_notes = asRoleNotes(parsed.role_notes);
  const color_notes =
    typeof parsed.color_notes === "string" && parsed.color_notes.trim()
      ? parsed.color_notes.trim().slice(0, 320)
      : undefined;

  const signature = String(parsed.signature ?? fallback.signature);
  let category =
    typeof parsed.category === "string"
      ? parsed.category
      : fallback.category
        ? fallback.category
        : undefined;
  const textBlob = [...(fallback.text_signals ?? []), look_summary, stack_summary].join(" ").toLowerCase();
  const socialCue = /testimonial|review|customer|kunde|quote|trusted by|as seen|logo marquee|partner/.test(textBlob);
  const commerceCue = /price|pricing|plan|€|\$|cart|shop|buy|kaufen|warenkorb|commerce/.test(textBlob);
  const thinSignature = signature === "body" || signature === "unknown";
  if (thinSignature && category === "social_proof" && !socialCue) {
    category = "content";
  }
  if (thinSignature && (category === "commerce" || category === "conversion") && !commerceCue) {
    category = "content";
  }

  return {
    section_id: String(parsed.section_id ?? fallback.section_id),
    signature,
    ...(category ? { category } : {}),
    stack_summary: stack_summary || look_summary.slice(0, 160),
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
    ...(spacing ? { spacing } : {}),
    ...(layout ? { layout } : {}),
    ...(role_notes ? { role_notes } : {}),
    ...(color_notes ? { color_notes } : {}),
    look_summary: (look_summary || stack_summary).slice(0, 900),
    ...(typeof parsed.interaction_summary === "string" && parsed.interaction_summary.trim()
      ? { interaction_summary: parsed.interaction_summary.trim().slice(0, 400) }
      : {}),
    confidence: clampConfidence(parsed.confidence),
    evidence_refs: asStringArray(parsed.evidence_refs)
  };
}

export const SECTION_LOOK_SYSTEM_PROMPT = `You are a meticulous design critic describing ONE measured web DESIGN SECTION in fine grain.
Return ONLY a single minified JSON object (no markdown, no trailing commas):
{"section_id":string,"signature":string,"category":string,"stack_summary":string,"background":{"kind":"solid"|"image"|"gradient"|"video"|"none","treatment":string},"overlay":{"present":boolean,"kind":"gradient"|"scrim"|"blur"|"other"|"null","notes":string},"shadows":{"present":boolean,"targets":["card"|"cta"|"text"|"container"],"notes":string},"typography_emphasis":["italic"|"bold"|"underline"|"all_caps"|"tight_tracking"],"alignment":{"text":"left"|"center"|"right","cta":"left"|"center"|"right"|"full_width"},"media":{"role":"background"|"hero"|"inline"|"none","object_fit":string,"notes":string},"spacing":{"gaps_px":number[],"notes":string},"layout":{"mode":string,"notes":string},"role_notes":[{"role":string,"notes":string}],"color_notes":string,"look_summary":string,"interaction_summary":string,"confidence":number,"evidence_refs":string[]}
Rules:
- Use ONLY provided CSS/recipe/geometry evidence; do not invent unseen UI, copy, or brand claims.
- category: best of hero|nav|feature|content|commerce|conversion|form|social_proof for THIS section. Refine when tall/full-bleed above-fold media is a hero, not a logo wall.
- look_summary: 3-5 sentences. Cover (1) overall composition & band, (2) media/background treatment with concrete CSS cues, (3) typography hierarchy (sizes/weights/align if present), (4) CTA/interaction placement, (5) spacing/shadow/overlay specifics. Unique to THIS section — never paste page_style_labels wholesale.
- stack_summary: reading-order role chain with short treatments (e.g. "full-bleed media_large cover → left heading 48px → underlined CTA").
- role_notes: one short note per important role with measured values (font-size, color, box w/h, object-fit, box-shadow).
- spacing/layout/color_notes: cite gaps_px, display/flex/gap, and color/contrast only when evidenced.
- Prefer concrete values ("0 8px 24px rgba…", "font-size:48px", "gap 24px") over vague adjectives ("premium", "modern", "minimalist") unless tied to evidence.
- confidence in (0,1); evidence_refs must cite node_ids and/or css property names.`;

export function sectionLookUserPrompt(evidenceJson: string): string {
  return `Stage=section_look (granular). Evidence JSON:\n${evidenceJson}\nReturn detailed JSON only.`;
}
