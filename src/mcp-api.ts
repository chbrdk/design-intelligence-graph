import { readFile } from "node:fs/promises";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "./storage.js";
import { searchKnowledgeGraph } from "./storage.js";

export const MCP_API_VERSION = "0.1.0";
export type McpToolName =
  | "dig_search"
  | "dig_inspect"
  | "dig_neighbors"
  | "dig_compare"
  | "dig_recommend"
  | "dig_reference_search"
  | "dig_reference_get"
  | "dig_reference_pack";

export async function loadKnowledgeGraph(path: string): Promise<KnowledgeGraph> {
  const graph = JSON.parse(await readFile(path, "utf8")) as KnowledgeGraph;
  if (graph.storage_model_version !== "0.1.0" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("Unsupported or invalid DIG knowledge graph");
  return graph;
}

const byId = (graph: KnowledgeGraph, nodeId: string) => graph.nodes.find((node) => node.node_id === nodeId);
const incident = (graph: KnowledgeGraph, nodeId: string) => graph.edges.filter((edge) => edge.from_node_id === nodeId || edge.to_node_id === nodeId);
const limited = <T>(items: T[], limit: unknown) => items.slice(0, typeof limit === "number" ? Math.max(0, Math.min(100, limit)) : 20);

export function listDigTools() {
  return [
    { name: "dig_search", description: "Search DIG graph nodes by deterministic substring match.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } } } },
    { name: "dig_inspect", description: "Inspect a graph node with directly incident edges.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" } } } },
    { name: "dig_neighbors", description: "Retrieve typed graph neighbors to a bounded depth of one.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" }, edge_type: { type: "string" }, limit: { type: "number" } } } },
    { name: "dig_compare", description: "Compare two graph nodes by type, properties, and shared neighbor IDs.", inputSchema: { type: "object", required: ["left_node_id", "right_node_id"], properties: { left_node_id: { type: "string" }, right_node_id: { type: "string" } } } },
    { name: "dig_recommend", description: "Recommend nodes with the same type or taxonomy as a seed node; deterministic, not model-ranked.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" }, limit: { type: "number" } } } },
    {
      name: "dig_reference_search",
      description: "Search Collection-scoped DesignReferences (DIG-012). Live mode requires platformProjectId.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          signature: { type: "string" },
          style_label: { type: "string" },
          platformProjectId: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "dig_reference_get",
      description: "Fetch one DesignReference by id (optionally scoped to platformProjectId).",
      inputSchema: {
        type: "object",
        required: ["reference_id"],
        properties: { reference_id: { type: "string" }, platformProjectId: { type: "string" } }
      }
    },
    {
      name: "dig_reference_pack",
      description: "Assemble a DesignReferencePack from ids + intent for generation prompts.",
      inputSchema: {
        type: "object",
        required: ["intent", "reference_ids"],
        properties: {
          intent: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          synthesis_mode: { type: "string", enum: ["structural", "look_conditioned"] },
          platformProjectId: { type: "string" }
        }
      }
    }
  ];
}

export function callDigTool(graph: KnowledgeGraph, name: McpToolName, args: Record<string, unknown>): unknown {
  if (name === "dig_reference_search" || name === "dig_reference_get" || name === "dig_reference_pack") {
    throw new Error(`Use callDigReferenceTool for ${name}`);
  }
  if (name === "dig_search") {
    const type = typeof args.type === "string" ? args.type : undefined;
    const matches = searchKnowledgeGraph(graph, String(args.query ?? ""), typeof args.limit === "number" ? args.limit : 20).filter((node) => !type || node.type === type);
    return { source_capture_run_id: graph.source_capture_run_id, matches };
  }
  const nodeId = String(args.node_id ?? "");
  if (name === "dig_inspect") {
    const node = byId(graph, nodeId); if (!node) throw new Error(`Unknown node: ${nodeId}`);
    return { node, edges: incident(graph, nodeId) };
  }
  if (name === "dig_neighbors") {
    if (!byId(graph, nodeId)) throw new Error(`Unknown node: ${nodeId}`);
    const edgeType = typeof args.edge_type === "string" ? args.edge_type : undefined;
    const edges = limited(incident(graph, nodeId).filter((edge) => !edgeType || edge.type === edgeType), args.limit);
    return { node_id: nodeId, neighbors: edges.map((edge) => ({ edge, node: byId(graph, edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id) })).filter((item) => item.node) };
  }
  if (name === "dig_compare") {
    const left = byId(graph, String(args.left_node_id ?? "")), right = byId(graph, String(args.right_node_id ?? ""));
    if (!left || !right) throw new Error("Both nodes must exist");
    const leftNeighbors = new Set(incident(graph, left.node_id).map((edge) => edge.from_node_id === left.node_id ? edge.to_node_id : edge.from_node_id));
    const shared = [...new Set(incident(graph, right.node_id).map((edge) => edge.from_node_id === right.node_id ? edge.to_node_id : edge.from_node_id).filter((id) => leftNeighbors.has(id)))].sort();
    const differingProperties = [...new Set([...Object.keys(left.properties), ...Object.keys(right.properties)])].filter((key) => JSON.stringify(left.properties[key]) !== JSON.stringify(right.properties[key])).sort();
    return { left, right, same_type: left.type === right.type, differing_properties: differingProperties, shared_neighbor_ids: shared };
  }
  if (name === "dig_recommend") {
    const seed = byId(graph, nodeId); if (!seed) throw new Error(`Unknown node: ${nodeId}`);
    const taxonomy = seed.properties.taxonomy_id;
    const candidates = graph.nodes.filter((node) => node.node_id !== seed.node_id && (node.properties.taxonomy_id === taxonomy || (!taxonomy && node.type === seed.type))).sort((a, b) => a.node_id.localeCompare(b.node_id));
    return { seed_node_id: seed.node_id, strategy: taxonomy ? "same_taxonomy_id" : "same_node_type", recommendations: limited(candidates, args.limit) };
  }
  throw new Error(`Unknown DIG tool: ${name}`);
}

export async function callDigReferenceTool(
  name: Extract<McpToolName, "dig_reference_search" | "dig_reference_get" | "dig_reference_pack">,
  args: Record<string, unknown>
): Promise<unknown> {
  const {
    searchDesignReferences,
    getDesignReference,
    assembleDesignReferencePack
  } = await import("./design-reference-library.js");
  const platformProjectId =
    typeof args.platformProjectId === "string"
      ? args.platformProjectId
      : typeof args.platform_project_id === "string"
        ? args.platform_project_id
        : null;
  if (name === "dig_reference_search") {
    const references = await searchDesignReferences({
      query: typeof args.query === "string" ? args.query : undefined,
      category: typeof args.category === "string" ? args.category : undefined,
      signature: typeof args.signature === "string" ? args.signature : undefined,
      style_label: typeof args.style_label === "string" ? args.style_label : undefined,
      platformProjectId,
      limit: typeof args.limit === "number" ? args.limit : 20
    });
    return { count: references.length, references };
  }
  if (name === "dig_reference_get") {
    const reference = await getDesignReference(String(args.reference_id ?? ""), { platformProjectId });
    if (!reference) throw new Error(`Unknown reference_id: ${String(args.reference_id ?? "")}`);
    return { reference };
  }
  const ids = Array.isArray(args.reference_ids)
    ? args.reference_ids.filter((id): id is string => typeof id === "string")
    : [];
  return assembleDesignReferencePack({
    intent: String(args.intent ?? ""),
    reference_ids: ids,
    synthesis_mode: args.synthesis_mode === "look_conditioned" ? "look_conditioned" : "structural",
    platformProjectId
  });
}

export function toolResult(value: unknown) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }; }
