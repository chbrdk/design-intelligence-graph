import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureDirectory, sha256, writeArtifact } from "./io.js";
import type { KnowledgeGraph } from "./storage.js";
import {
  LOOK_CONDITIONED_GENERATION_VERSION,
  deriveLookConditionedLayout,
  type LayoutHints,
  type LookConditionedLayoutSpec
} from "./look-conditioned-generation.js";
import type { DesignReferencePack } from "./design-reference-library.js";

export const LAYOUT_GENERATION_VERSION = "0.1.0";
export { LOOK_CONDITIONED_GENERATION_VERSION, deriveLookConditionedLayout };
export type { LayoutHints, LookConditionedLayoutSpec };

export interface LayoutSpecification {
  schema_version: string;
  generation_version: string;
  source_capture_run_id: string;
  generated_at: string;
  intent: "evidence_based_structural_synthesis" | "look_conditioned_structural_synthesis";
  breakpoints: Array<{ name: string; min_width: number }>;
  tokens: { typography_slots: string[]; color_slots: string[]; shape_slots: string[] };
  token_hints?: LookConditionedLayoutSpec["token_hints"];
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
}

export function deriveLayoutSpecification(graph: KnowledgeGraph): LayoutSpecification {
  const byTaxonomy = new Map<string, string[]>();
  for (const node of graph.nodes.filter((node) => node.type === "ontology_entity")) {
    const taxonomy =
      typeof node.properties.taxonomy_id === "string" ? node.properties.taxonomy_id : "dig:element.container";
    byTaxonomy.set(taxonomy, [...(byTaxonomy.get(taxonomy) ?? []), node.node_id]);
  }
  const entries = [...byTaxonomy.entries()].sort(([a], [b]) => a.localeCompare(b));
  const blocks = entries.map(([taxonomy_id, source_node_ids], index) => ({
    block_id: `blk_${String(index + 1).padStart(3, "0")}_${sha256(taxonomy_id).slice(7, 15)}`,
    kind: taxonomy_id.split(".")[1] ?? "container",
    taxonomy_id,
    source_node_ids: source_node_ids.sort(),
    responsive: {
      mobile: "single_column_or_intrinsic",
      tablet: "preserve_evidence_based_order",
      desktop: "preserve_evidence_based_order"
    }
  }));
  return {
    schema_version: "0.1.0",
    generation_version: LAYOUT_GENERATION_VERSION,
    source_capture_run_id: graph.source_capture_run_id,
    generated_at: new Date().toISOString(),
    intent: "evidence_based_structural_synthesis",
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
    blocks,
    provenance: {
      graph_lineage_count: graph.lineage.length,
      methods: ["taxonomy_grouping", "canonical_breakpoint_contract", "source_node_lineage"]
    },
    constraints: [
      "No source text or asset bytes are copied",
      "Every block retains one or more source graph node IDs",
      "Responsive values are structural placeholders unless a future renderer resolves measured geometry"
    ]
  };
}

export function deriveLayoutFromReferencePack(input: {
  pack: DesignReferencePack;
  graph?: KnowledgeGraph | null;
  layout_hints?: LayoutHints | null;
  root?: string;
}): LayoutSpecification {
  return deriveLookConditionedLayout(input) as LayoutSpecification;
}

export async function generateLayoutSpecification(
  graphPath: string,
  outputDirectory: string,
  options: {
    packPath?: string;
    layoutHintsPath?: string;
    root?: string;
  } = {}
): Promise<{ outputRoot: string; specification: LayoutSpecification }> {
  const graph = JSON.parse(await readFile(graphPath, "utf8")) as KnowledgeGraph;
  if (graph.storage_model_version !== "0.1.0") throw new Error("Unsupported DIG knowledge graph");

  let specification: LayoutSpecification;
  if (options.packPath) {
    const pack = JSON.parse(await readFile(options.packPath, "utf8")) as DesignReferencePack;
    const layout_hints = options.layoutHintsPath
      ? (JSON.parse(await readFile(options.layoutHintsPath, "utf8")) as LayoutHints)
      : null;
    specification = deriveLayoutFromReferencePack({
      pack,
      graph,
      layout_hints,
      ...(options.root !== undefined ? { root: options.root } : {})
    });
  } else {
    specification = deriveLayoutSpecification(graph);
  }

  const outputRoot = resolve(outputDirectory, `${graph.source_capture_run_id}`);
  await ensureDirectory(outputRoot);
  const artifact = await writeArtifact(
    outputRoot,
    "layout-spec.json",
    JSON.stringify(specification, null, 2),
    "application/json"
  );
  await writeArtifact(
    outputRoot,
    "generation-manifest.json",
    JSON.stringify(
      {
        schema_version: "0.1.0",
        generation_version: specification.generation_version,
        source_graph: resolve(graphPath),
        layout_specification: artifact,
        ...(options.packPath ? { design_reference_pack: resolve(options.packPath) } : {})
      },
      null,
      2
    ),
    "application/json"
  );
  return { outputRoot, specification };
}
