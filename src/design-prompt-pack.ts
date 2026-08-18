/**
 * DIG-012 Wave 3 — DesignPromptPack assembler (deterministic).
 * @see docs/DIG-012-prompt-pack.md
 */
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { referenceIdForSection } from "./design-reference-emit.js";
import type { DesignReferencePack } from "./design-reference-library.js";
import { validateAgainstSchema } from "./flow-schema-validate.js";
import {
  lookContractRules,
  resolveLookContract,
  type CompactLookTokens,
  type LookContract
} from "./look-contract.js";
import type { PageRhythm } from "./page-rhythm.js";
import { pageRhythmHasSignal, pageRhythmRules } from "./page-rhythm.js";
import type { DesignTokensDocument } from "./design-tokens.js";
import type { VisualCraft } from "./vision-page.js";
import { visualCraftHasSignal } from "./vision-page.js";

export const DESIGN_PROMPT_PACK_SCHEMA_VERSION = "0.1.0" as const;
export const PROMPT_PACK_MAX_BYTES = 16_000;
export const COMPACT_REF_MAX_BYTES = 2_500;

export type PromptOutputContract = "layout_hints_json" | "prose_brief" | "both";

export type CompactReference = {
  reference_id: string;
  scope?: string;
  taxonomy: { category: string; taxonomy_ids?: string[]; screen_patterns?: string[] };
  composition: {
    signature: string;
    stack_summary: string;
    roles?: string[];
  };
  look: {
    look_summary: string;
    alignment?: unknown;
    overlay?: unknown;
    shadows?: unknown;
    background?: unknown;
    confidence: number;
  };
  tokens?: {
    colors?: Array<{ hex: string; roles?: string[] }>;
    typography?: Array<{ family?: string; size?: string; weight?: string; role?: string }>;
    style_labels?: string[];
  };
  flow_context?: { flow_action_ids?: string[] };
};

export type DesignPromptPack = {
  schema_version: typeof DESIGN_PROMPT_PACK_SCHEMA_VERSION;
  role: "design_synthesis";
  brief: string;
  rules: string[];
  references: CompactReference[];
  ask: string;
  output_contract: PromptOutputContract;
  look_contract?: LookContract;
  page_rhythm?: PageRhythm;
  visual_craft?: VisualCraft;
};

export const HARD_RULES: string[] = [
  "Do not copy source marketing headlines, body copy, or brand names from references unless the brief explicitly asks to redesign that product.",
  "Do not invent measured geometry; treat gaps/roles as structural hints.",
  "Prefer primary reference (index 0) for look; secondary refs only for contrast or missing roles.",
  "Cite reference_ids in the output when making look claims.",
  "Separate structure (signature, roles, taxonomy) from feel (look_summary, tokens).",
  "If look_contract is present, it outranks vibe adjectives in the brief.",
  "If page_rhythm is present, it outranks generic landing-page / card-kit structure.",
  "If visual_craft is present, implement type/image layering and typographic composition literally; do not flatten into a generic card kit."
];

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function compactDesignReference(ref: DesignReferenceRecord): CompactReference {
  const colors = (ref.tokens as { colors?: Array<{ hex: string; roles?: string[] }> } | undefined)?.colors?.slice(
    0,
    6
  );
  const typography = (
    ref.tokens as {
      typography?: Array<{ family?: string; size?: string; weight?: string; role?: string }>;
    } | undefined
  )?.typography?.slice(0, 3);
  const styleLabels = ref.tokens?.style_labels?.slice(0, 8);
  const flowActions = (ref as { flow_context?: { flow_action_ids?: string[] } }).flow_context
    ?.flow_action_ids;

  const compact: CompactReference = {
    reference_id: ref.reference_id,
    scope: ref.scope,
    taxonomy: {
      category: ref.taxonomy.category,
      ...(ref.taxonomy.taxonomy_ids?.length ? { taxonomy_ids: ref.taxonomy.taxonomy_ids.slice(0, 8) } : {}),
      ...(ref.taxonomy.screen_patterns?.length
        ? { screen_patterns: ref.taxonomy.screen_patterns.slice(0, 8) }
        : {})
    },
    composition: {
      signature: ref.composition.signature,
      stack_summary: truncate(ref.composition.stack_summary, 200),
      ...(ref.composition.roles?.length ? { roles: ref.composition.roles.slice(0, 12) } : {})
    },
    look: {
      look_summary: truncate(ref.look.look_summary, 280),
      confidence: ref.look.confidence,
      ...(ref.look.alignment ? { alignment: ref.look.alignment } : {}),
      ...(ref.look.overlay ? { overlay: ref.look.overlay } : {}),
      ...(ref.look.shadows ? { shadows: ref.look.shadows } : {}),
      ...(ref.look.background ? { background: ref.look.background } : {})
    }
  };
  if (colors?.length || typography?.length || styleLabels?.length) {
    compact.tokens = {
      ...(colors?.length ? { colors } : {}),
      ...(typography?.length ? { typography } : {}),
      ...(styleLabels?.length ? { style_labels: styleLabels } : {})
    };
  }
  if (flowActions?.length) {
    compact.flow_context = { flow_action_ids: flowActions.slice(0, 8) };
  }

  let serialized = JSON.stringify(compact);
  if (serialized.length > COMPACT_REF_MAX_BYTES) {
    delete compact.tokens?.typography;
    serialized = JSON.stringify(compact);
  }
  if (serialized.length > COMPACT_REF_MAX_BYTES) {
    delete compact.tokens?.colors;
    serialized = JSON.stringify(compact);
  }
  if (serialized.length > COMPACT_REF_MAX_BYTES) {
    compact.look.look_summary = truncate(compact.look.look_summary, 160);
  }
  return compact;
}

export function syntheticScreenReference(input: {
  captureRunId: string;
  visionPage?: {
    page_type?: string | null;
    overall_atmosphere?: string | null;
    color_mood?: string | null;
    layout_system?: string | null;
    spacing_feel?: string | null;
    above_fold_job?: string | null;
    notable_modules?: string[] | null;
  } | null;
  lookContract?: LookContract | null;
  designSummary?: string | null;
  style?: string | null;
  layout?: string | null;
}): DesignReferenceRecord {
  const page = input.visionPage ?? null;
  const contract = input.lookContract ?? null;
  const lookBits = [
    page?.overall_atmosphere,
    page?.color_mood,
    input.layout ?? page?.layout_system,
    page?.above_fold_job,
    input.designSummary
  ]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  const look_summary = truncate(lookBits.join(" · ") || "Captured screen look contract", 400);
  const modules = (page?.notable_modules ?? []).map(String).filter(Boolean).slice(0, 4);
  const signature = modules.length ? modules.join(">") : "media>heading>cta";
  const colors = [
    contract?.colors.bg ? { hex: contract.colors.bg, roles: ["background"] } : null,
    contract?.colors.ink ? { hex: contract.colors.ink, roles: ["foreground"] } : null,
    contract?.colors.accent ? { hex: contract.colors.accent, roles: ["accent"] } : null
  ].filter((item): item is { hex: string; roles: string[] } => Boolean(item));
  const styleLabels = [input.style, page?.overall_atmosphere].filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim())
  );
  const record: DesignReferenceRecord = {
    schema_version: "0.1.0",
    reference_id: referenceIdForSection(input.captureRunId, "screen"),
    capture_run_id: input.captureRunId,
    scope: "screen",
    section_id: null,
    viewport_capture_id: null,
    taxonomy: {
      category: "screen",
      taxonomy_ids: ["dig:pattern.unknown"]
    },
    composition: {
      signature,
      stack_summary: truncate(
        [input.layout ?? page?.layout_system, page?.spacing_feel, look_summary].filter(Boolean).join(" · "),
        200
      )
    },
    look: {
      look_summary,
      confidence: 0.7
    },
    provenance: {
      evidence_refs: ["look_contract", "vision_page"],
      methods: ["look_contract", "vision_page"],
      layers: ["L3"]
    }
  };
  const tokenPack: {
    style_labels?: string[];
    colors?: Array<{ hex: string; roles: string[] }>;
    typography?: Array<{ family: string; role: string }>;
    radii?: string[];
  } = {};
  if (styleLabels.length) tokenPack.style_labels = styleLabels.slice(0, 8);
  if (colors.length) tokenPack.colors = colors;
  if (contract?.typography.display) {
    tokenPack.typography = [{ family: contract.typography.display, role: "display" }];
  }
  if (contract?.radius_px != null) tokenPack.radii = [`${contract.radius_px}px`];
  if (Object.keys(tokenPack).length) {
    record.tokens = tokenPack as NonNullable<DesignReferenceRecord["tokens"]>;
  }
  return record;
}

function buildAsk(
  contract: PromptOutputContract,
  primaryId: string,
  hasRhythm: boolean,
  hasCraft: boolean
): string {
  const rhythm = hasRhythm ? " Obey page_rhythm.page_arc; do not collapse into a card-kit hero." : "";
  const craft = hasCraft
    ? " Obey visual_craft: type/image overlap, typographic composition, imagery treatments, and rebuild_spec."
    : "";
  if (contract === "prose_brief") {
    return `Write a ≤280-word creative direction citing ${primaryId}. Follow look_contract.${rhythm}${craft} Do not copy source marketing copy.`;
  }
  if (contract === "both") {
    return `Return layout_hints_json first (DIG-012 contract), then a short prose rationale. Cite ${primaryId}. Obey look_contract.avoid.${rhythm}${craft}`;
  }
  return `Return ONLY layout_hints_json matching the DIG-012 layout hints contract. Cite ${primaryId}. Apply look_contract colors/type/radius/CTA; never substitute glassmorphic defaults.${rhythm}${craft}`;
}

export function assembleDesignPromptPack(input: {
  brief: string;
  pack: DesignReferencePack;
  output_contract?: PromptOutputContract;
  look_contract?: LookContract | null;
  page_rhythm?: PageRhythm | null;
  tokens?: DesignTokensDocument | null;
  layout?: string | null;
  style?: string | null;
  spacing_feel?: string | null;
  visual_craft?: VisualCraft | null;
}): DesignPromptPack {
  const brief = input.brief.trim();
  if (!brief) throw new Error("brief required");
  const refs = input.pack.references.slice(0, 8);
  if (!refs.length) throw new Error("pack.references required");

  const primary = refs[0]!;
  const compactTokens = primary.tokens as CompactLookTokens | undefined;
  const look_contract = resolveLookContract({
    look_contract: input.look_contract ?? null,
    tokens: input.tokens ?? null,
    compact_tokens: compactTokens ?? null,
    spacing_feel: input.spacing_feel ?? null,
    layout: input.layout ?? primary.composition.stack_summary,
    style: input.style ?? compactTokens?.style_labels?.[0] ?? null
  });
  const page_rhythm = pageRhythmHasSignal(input.page_rhythm) ? input.page_rhythm! : null;
  const visual_craft = visualCraftHasSignal(input.visual_craft) ? input.visual_craft! : null;

  const forbid = Boolean(input.pack.constraints?.forbid_source_copy);
  const rules = [
    ...HARD_RULES,
    ...lookContractRules(look_contract),
    ...(page_rhythm ? pageRhythmRules(page_rhythm) : []),
    ...(forbid ? ["forbid_source_copy is absolute for this pack."] : [])
  ];
  const contract = input.output_contract ?? "layout_hints_json";
  const primaryId = refs[0]!.reference_id;

  let compacted = refs.map(compactDesignReference);
  let prompt: DesignPromptPack = {
    schema_version: DESIGN_PROMPT_PACK_SCHEMA_VERSION,
    role: "design_synthesis",
    brief,
    rules,
    references: compacted,
    ask: buildAsk(contract, primaryId, Boolean(page_rhythm), Boolean(visual_craft)),
    output_contract: contract,
    look_contract,
    ...(page_rhythm ? { page_rhythm } : {}),
    ...(visual_craft ? { visual_craft } : {})
  };

  // Drop page-level noise already omitted; if still over budget, shrink look summaries.
  while (JSON.stringify(prompt).length > PROMPT_PACK_MAX_BYTES && compacted.length > 1) {
    compacted = compacted.slice(0, -1);
    prompt = { ...prompt, references: compacted };
  }
  if (JSON.stringify(prompt).length > PROMPT_PACK_MAX_BYTES) {
    compacted = compacted.map((ref) => ({
      ...ref,
      look: { ...ref.look, look_summary: truncate(ref.look.look_summary, 120) }
    }));
    prompt = { ...prompt, references: compacted };
  }

  const issues = validateAgainstSchema("designPromptPack", prompt);
  if (issues.length) {
    throw new Error(`DesignPromptPack invalid: ${issues.map((i) => i.message).join("; ")}`);
  }
  return prompt;
}

/** Thin wrapper kept for eval R2 — uses Wave 3 assembler. */
export function assemblePromptPackEnvelope(
  brief: string,
  primary: DesignReferenceRecord,
  forbidSourceCopy = true
): DesignPromptPack {
  return assembleDesignPromptPack({
    brief,
    pack: {
      schema_version: "0.1.0",
      intent: brief,
      references: [primary],
      synthesis_mode: "structural",
      constraints: { forbid_source_copy: true },
      ...(forbidSourceCopy ? {} : {})
    },
    output_contract: "layout_hints_json"
  });
}
