/**
 * DIG-012 Wave 4 — look_conditioned layout generation.
 * Mapping SoT: fixtures/design-references/look-conditioned-mapping.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./io.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import type { DesignReferencePack } from "./design-reference-library.js";
import type { KnowledgeGraph } from "./storage.js";
import type { DesignTokensDocument } from "./design-tokens.js";
import {
  lookContractGenerateConstraints,
  resolveLookContract,
  tokenHintsFromLookContract,
  type CompactLookTokens,
  type LookContract,
  type LookTokenHints
} from "./look-contract.js";
import { loadDigPaths } from "./runtime-paths.js";

export const LOOK_CONDITIONED_GENERATION_VERSION = "0.3.0";
export const LOOK_CONDITIONED_CONSTRAINT_CAP_DEFAULT = 20;

export type LayoutHints = {
  primary_reference_id?: string;
  proposed_signature?: string;
  block_plan?: Array<{ role: string; notes?: string; alignment?: string; emphasis?: string }>;
  token_hints?: Record<string, unknown>;
  look_directives?: string[];
  avoid?: string[];
  cited_reference_ids?: string[];
};

export type LookConditionedLayoutSpec = {
  schema_version: "0.1.0";
  generation_version: typeof LOOK_CONDITIONED_GENERATION_VERSION;
  source_capture_run_id: string;
  generated_at: string;
  intent: "look_conditioned_structural_synthesis";
  breakpoints: Array<{ name: string; min_width: number }>;
  tokens: { typography_slots: string[]; color_slots: string[]; shape_slots: string[] };
  token_hints?: {
    colors?: Record<string, string>;
    typography?: Record<string, string>;
    shape?: Record<string, string>;
  } | undefined;
  look_contract?: LookContract;
  blocks: Array<{
    block_id: string;
    kind: string;
    taxonomy_id: string;
    source_node_ids: string[];
    responsive: { mobile: string; tablet: string; desktop: string };
  }>;
  provenance: {
    graph_lineage_count: number;
    methods: string[];
    seed?: "blank_canvas" | "graph";
    reference_ids?: string[];
    layout_hints_used?: boolean;
    look_contract_used?: boolean;
  };
  constraints: string[];
};

type MappingDoc = {
  role_to_taxonomy: Record<string, string>;
  look_to_constraints: Array<{
    when: { path: string; in?: string[]; eq?: string; includes?: string };
    constraint: string;
  }>;
};

let cachedMapping: MappingDoc | null = null;

export function loadLookConditionedMapping(root = process.cwd()): MappingDoc {
  if (cachedMapping) return cachedMapping;
  const raw = JSON.parse(
    readFileSync(resolve(root, "fixtures/design-references/look-conditioned-mapping.json"), "utf8")
  ) as MappingDoc;
  cachedMapping = raw;
  return raw;
}

function constraintCap(): number {
  const n = loadDigPaths().lookContract?.generateConstraintCap;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : LOOK_CONDITIONED_CONSTRAINT_CAP_DEFAULT;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function constraintsFromLook(ref: DesignReferenceRecord, mapping: MappingDoc): string[] {
  const out: string[] = [];
  for (const rule of mapping.look_to_constraints) {
    const value = getPath(ref, rule.when.path);
    if (rule.when.in && typeof value === "string" && rule.when.in.includes(value)) {
      out.push(rule.constraint);
    } else if (rule.when.eq !== undefined && value === rule.when.eq) {
      out.push(rule.constraint);
    } else if (rule.when.includes !== undefined && Array.isArray(value) && value.includes(rule.when.includes)) {
      out.push(rule.constraint);
    }
  }
  return out;
}

function tokenHintsFromReference(ref: DesignReferenceRecord): LookTokenHints {
  const colors = (ref.tokens as { colors?: Array<{ hex: string; roles?: string[] }> } | undefined)?.colors ?? [];
  const typography =
    (ref.tokens as { typography?: Array<{ role?: string; family?: string; size?: string; weight?: string }> } | undefined)
      ?.typography ?? [];
  const radii = (ref.tokens as { radii?: string[] } | undefined)?.radii ?? [];
  const hints: LookTokenHints = { colors: {}, typography: {}, shape: {} };
  for (const color of colors) {
    const roles = color.roles ?? [];
    if (roles.includes("accent") || roles.includes("cta")) hints.colors.accent = color.hex;
    if (roles.includes("foreground")) hints.colors.foreground = color.hex;
    if (roles.includes("background")) hints.colors.background = color.hex;
  }
  for (const row of typography) {
    if (row.role === "display" || row.role === "heading" || row.role === "title") {
      hints.typography.heading = [row.family, row.weight, row.size].filter(Boolean).join(" ");
    }
  }
  if (radii[0]) hints.shape.radius = radii[0];
  return hints;
}

function mergeHintBag(base: LookTokenHints, overlay: LookTokenHints, mode: "overwrite" | "fill"): LookTokenHints {
  const mergeObj = (left: Record<string, string>, right: Record<string, string>): Record<string, string> => {
    const out = { ...left };
    for (const [key, value] of Object.entries(right)) {
      if (!value) continue;
      if (mode === "overwrite" || !out[key]) out[key] = value;
    }
    return out;
  };
  return {
    colors: mergeObj(base.colors, overlay.colors),
    typography: mergeObj(base.typography, overlay.typography),
    shape: mergeObj(base.shape, overlay.shape)
  };
}

function hintsFromLayoutHints(raw: Record<string, unknown> | undefined): LookTokenHints {
  const empty: LookTokenHints = { colors: {}, typography: {}, shape: {} };
  if (!raw) return empty;
  const nestedColors = raw.colors;
  const nestedType = raw.typography;
  const nestedShape = raw.shape;
  if (nestedColors && typeof nestedColors === "object" && !Array.isArray(nestedColors)) {
    empty.colors = Object.fromEntries(
      Object.entries(nestedColors as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])
      )
    );
  } else {
    if (typeof raw.accent === "string") empty.colors.accent = raw.accent;
    if (typeof raw.foreground === "string") empty.colors.foreground = raw.foreground;
    if (typeof raw.background === "string") empty.colors.background = raw.background;
  }
  if (nestedType && typeof nestedType === "object" && !Array.isArray(nestedType)) {
    empty.typography = Object.fromEntries(
      Object.entries(nestedType as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])
      )
    );
  }
  if (nestedShape && typeof nestedShape === "object" && !Array.isArray(nestedShape)) {
    empty.shape = Object.fromEntries(
      Object.entries(nestedShape as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])
      )
    );
  } else if (typeof raw.radius === "string") {
    empty.shape.radius = raw.radius;
  }
  return empty;
}

export function deriveLookConditionedLayout(input: {
  pack: DesignReferencePack;
  graph?: KnowledgeGraph | null | undefined;
  layout_hints?: LayoutHints | null | undefined;
  look_contract?: LookContract | null;
  tokens?: DesignTokensDocument | null;
  layout?: string | null;
  style?: string | null;
  spacing_feel?: string | null;
  root?: string | undefined;
}): LookConditionedLayoutSpec {
  const mapping = loadLookConditionedMapping(input.root);
  const primary = input.pack.references[0];
  if (!primary) throw new Error("DesignReferencePack requires at least one reference");

  const compactTokens = primary.tokens as CompactLookTokens | undefined;
  const look_contract = resolveLookContract({
    look_contract: input.look_contract ?? null,
    tokens: input.tokens ?? null,
    compact_tokens: compactTokens ?? null,
    spacing_feel: input.spacing_feel ?? null,
    layout: input.layout ?? primary.composition.stack_summary,
    style: input.style ?? compactTokens?.style_labels?.[0] ?? null
  });

  let signature = primary.composition.signature;
  const methods = ["look_conditioned_block_plan", "token_hints_from_reference", "look_contract_token_hints"];
  if (input.layout_hints?.proposed_signature) {
    const roles = input.layout_hints.proposed_signature.split(">").map((r) => r.trim()).filter(Boolean);
    if (roles.every((role) => Boolean(mapping.role_to_taxonomy[role]))) {
      signature = input.layout_hints.proposed_signature;
      methods.push("layout_hints_merge");
    }
  }

  const roles = signature.split(">").map((r) => r.trim()).filter(Boolean);
  const graph = input.graph ?? null;
  const byTaxonomy = new Map<string, string[]>();
  if (graph) {
    for (const node of graph.nodes.filter((n) => n.type === "ontology_entity")) {
      const taxonomy =
        typeof node.properties.taxonomy_id === "string" ? node.properties.taxonomy_id : "dig:element.container";
      byTaxonomy.set(taxonomy, [...(byTaxonomy.get(taxonomy) ?? []), node.node_id]);
    }
  }

  const blocks = roles.map((role, index) => {
    const taxonomy_id = mapping.role_to_taxonomy[role] ?? `dig:pattern.${role}`;
    const source_node_ids = [...(byTaxonomy.get(taxonomy_id) ?? [])].sort();
    return {
      block_id: `blk_${String(index + 1).padStart(3, "0")}_${sha256(`${role}|${taxonomy_id}`).slice(7, 15)}`,
      kind: taxonomy_id.split(".")[1] ?? "container",
      taxonomy_id,
      source_node_ids,
      responsive: {
        mobile: "single_column_or_intrinsic",
        tablet: "preserve_evidence_based_order",
        desktop: "preserve_evidence_based_order"
      }
    };
  });

  let token_hints = mergeHintBag(
    tokenHintsFromReference(primary),
    tokenHintsFromLookContract(look_contract),
    "overwrite"
  );
  if (input.layout_hints?.token_hints && typeof input.layout_hints.token_hints === "object") {
    token_hints = mergeHintBag(token_hints, hintsFromLayoutHints(input.layout_hints.token_hints), "fill");
  }

  const constraints = new Set<string>([
    "No source text or asset bytes are copied",
    "Look cues are structural/feel hints, not L1 measurements of the target",
    ...lookContractGenerateConstraints(look_contract),
    ...constraintsFromLook(primary, mapping)
  ]);
  for (const line of input.layout_hints?.look_directives ?? []) constraints.add(`hint:${line}`);
  for (const line of input.layout_hints?.avoid ?? []) constraints.add(`hint:avoid:${line}`);

  const seed: "blank_canvas" | "graph" = graph ? "graph" : "blank_canvas";
  const reference_ids =
    input.layout_hints?.cited_reference_ids?.length
      ? input.layout_hints.cited_reference_ids
      : input.pack.references.map((r) => r.reference_id).slice(0, 8);

  return {
    schema_version: "0.1.0",
    generation_version: LOOK_CONDITIONED_GENERATION_VERSION,
    source_capture_run_id: graph?.source_capture_run_id ?? "blank_canvas",
    generated_at: new Date().toISOString(),
    intent: "look_conditioned_structural_synthesis",
    breakpoints: [
      { name: "mobile", min_width: 0 },
      { name: "tablet", min_width: 768 },
      { name: "desktop", min_width: 1440 }
    ],
    tokens: {
      typography_slots: ["body", "heading", "label"],
      color_slots: ["foreground", "background", "border", "accent"],
      shape_slots: ["radius", "border", "shadow"]
    },
    token_hints,
    look_contract,
    blocks,
    provenance: {
      graph_lineage_count: graph?.lineage.length ?? 0,
      methods,
      seed,
      reference_ids,
      layout_hints_used: Boolean(input.layout_hints),
      look_contract_used: true
    },
    constraints: [...constraints].slice(0, constraintCap())
  };
}
