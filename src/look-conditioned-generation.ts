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

export const LOOK_CONDITIONED_GENERATION_VERSION = "0.2.0";

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
  };
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

function tokenHintsFromReference(ref: DesignReferenceRecord): LookConditionedLayoutSpec["token_hints"] {
  const colors = (ref.tokens as { colors?: Array<{ hex: string; roles?: string[] }> } | undefined)?.colors ?? [];
  const typography =
    (ref.tokens as { typography?: Array<{ role?: string; family?: string; size?: string; weight?: string }> } | undefined)
      ?.typography ?? [];
  const radii = (ref.tokens as { radii?: string[] } | undefined)?.radii ?? [];
  const hints: NonNullable<LookConditionedLayoutSpec["token_hints"]> = { colors: {}, typography: {}, shape: {} };
  for (const color of colors) {
    const roles = color.roles ?? [];
    if (roles.includes("accent") || roles.includes("cta")) hints.colors!.accent = color.hex;
    if (roles.includes("foreground")) hints.colors!.foreground = color.hex;
    if (roles.includes("background")) hints.colors!.background = color.hex;
  }
  for (const row of typography) {
    if (row.role === "display" || row.role === "heading" || row.role === "title") {
      hints.typography!.heading = [row.family, row.weight, row.size].filter(Boolean).join(" ");
    }
  }
  if (radii[0]) hints.shape!.radius = radii[0];
  return hints;
}

export function deriveLookConditionedLayout(input: {
  pack: DesignReferencePack;
  graph?: KnowledgeGraph | null;
  layout_hints?: LayoutHints | null;
  root?: string;
}): LookConditionedLayoutSpec {
  const mapping = loadLookConditionedMapping(input.root);
  const primary = input.pack.references[0];
  if (!primary) throw new Error("DesignReferencePack requires at least one reference");

  let signature = primary.composition.signature;
  const methods = ["look_conditioned_block_plan", "token_hints_from_reference"];
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

  let token_hints = tokenHintsFromReference(primary);
  if (input.layout_hints?.token_hints && typeof input.layout_hints.token_hints === "object") {
    const hintColors = (input.layout_hints.token_hints as { colors?: Record<string, string> }).colors;
    if (hintColors) token_hints = { ...token_hints, colors: { ...token_hints?.colors, ...hintColors } };
  }

  const constraints = new Set<string>([
    "No source text or asset bytes are copied",
    "Look cues are structural/feel hints, not L1 measurements of the target",
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
    blocks,
    provenance: {
      graph_lineage_count: graph?.lineage.length ?? 0,
      methods,
      seed,
      reference_ids,
      layout_hints_used: Boolean(input.layout_hints)
    },
    constraints: [...constraints].slice(0, 12)
  };
}
