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
  | "dig_reference_pack"
  | "dig_reference_prompt_pack"
  | "dig_generate"
  | "dig_screen_search"
  | "dig_capture_prompt_pack"
  | "dig_flow_search"
  | "dig_flow_get"
  | "dig_flow_neighbors";

const REFERENCE_TOOL_NAMES = new Set<McpToolName>([
  "dig_reference_search",
  "dig_reference_get",
  "dig_reference_pack",
  "dig_reference_prompt_pack",
  "dig_generate"
]);

const LIBRARY_TOOL_NAMES = new Set<McpToolName>(["dig_screen_search", "dig_capture_prompt_pack"]);

const FLOW_TOOL_NAMES = new Set<McpToolName>([
  "dig_flow_search",
  "dig_flow_get",
  "dig_flow_neighbors"
]);

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
      description:
        "Search Collection-scoped DesignReferences (DIG-012). Filter by style/layout/industry facets. Live mode requires platformProjectId.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          category: { type: "string" },
          signature: { type: "string" },
          style_label: { type: "string" },
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          similar_to: { type: "string" },
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
    },
    {
      name: "dig_reference_prompt_pack",
      description: "Assemble a DesignPromptPack (Wave 3) from reference ids + brief.",
      inputSchema: {
        type: "object",
        required: ["intent", "reference_ids"],
        properties: {
          intent: { type: "string" },
          brief: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          synthesis_mode: { type: "string", enum: ["structural", "look_conditioned"] },
          output_contract: {
            type: "string",
            enum: ["layout_hints_json", "prose_brief", "both"]
          },
          platformProjectId: { type: "string" }
        }
      }
    },
    {
      name: "dig_generate",
      description: "Look-conditioned layout generation from DesignReferences (DIG-012 Wave 4 / dig.generate).",
      inputSchema: {
        type: "object",
        required: ["intent", "reference_ids"],
        properties: {
          intent: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          platformProjectId: { type: "string" }
        }
      }
    },
    {
      name: "dig_screen_search",
      description:
        "Search captured Library screens by Style/Layout/Industry facets. Returns capture_run_id + design_facets (no server paths). Live mode requires platformProjectId.",
      inputSchema: {
        type: "object",
        properties: {
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          platformProjectId: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "dig_capture_prompt_pack",
      description:
        "Assemble a DesignPromptPack from one capture (look_contract + page_rhythm). Use after dig_screen_search.",
      inputSchema: {
        type: "object",
        required: ["capture_run_id"],
        properties: {
          capture_run_id: { type: "string" },
          brief: { type: "string" },
          platformProjectId: { type: "string" },
          output_contract: {
            type: "string",
            enum: ["layout_hints_json", "prose_brief", "both"]
          }
        }
      }
    },
    {
      name: "dig_flow_search",
      description: "Search DIG-011 multi-screen Flows by flow_action / app_scope / title (read-only).",
      inputSchema: {
        type: "object",
        properties: {
          flow_action: { type: "string" },
          app_scope_id: { type: "string" },
          q: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "dig_flow_get",
      description: "Fetch one DIG-011 Flow graph by flow_id.",
      inputSchema: {
        type: "object",
        required: ["flow_id"],
        properties: { flow_id: { type: "string" } }
      }
    },
    {
      name: "dig_flow_neighbors",
      description: "List inbound/outbound screens for a Flow screen via measured edges.",
      inputSchema: {
        type: "object",
        required: ["flow_id", "flow_screen_id"],
        properties: {
          flow_id: { type: "string" },
          flow_screen_id: { type: "string" }
        }
      }
    }
  ];
}

export function callDigTool(graph: KnowledgeGraph, name: McpToolName, args: Record<string, unknown>): unknown {
  if (REFERENCE_TOOL_NAMES.has(name)) {
    throw new Error(`Use callDigReferenceTool for ${name}`);
  }
  if (LIBRARY_TOOL_NAMES.has(name)) {
    throw new Error(`Use callDigLibraryTool for ${name}`);
  }
  if (FLOW_TOOL_NAMES.has(name)) {
    throw new Error(`Use callDigFlowTool for ${name}`);
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
  name: Extract<
    McpToolName,
    | "dig_reference_search"
    | "dig_reference_get"
    | "dig_reference_pack"
    | "dig_reference_prompt_pack"
    | "dig_generate"
  >,
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
      style: typeof args.style === "string" ? args.style : undefined,
      layout: typeof args.layout === "string" ? args.layout : undefined,
      industry: typeof args.industry === "string" ? args.industry : undefined,
      similar_to:
        typeof args.similar_to === "string"
          ? args.similar_to
          : typeof args.similarTo === "string"
            ? args.similarTo
            : undefined,
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
  const pack = await assembleDesignReferencePack({
    intent: String(args.intent ?? args.brief ?? ""),
    reference_ids: ids,
    synthesis_mode:
      name === "dig_generate"
        ? "look_conditioned"
        : args.synthesis_mode === "look_conditioned"
          ? "look_conditioned"
          : "structural",
    platformProjectId
  });
  if (name === "dig_reference_pack") return pack;
  if (name === "dig_reference_prompt_pack") {
    const { assembleDesignPromptPack } = await import("./design-prompt-pack.js");
    const brief =
      typeof args.brief === "string" && args.brief.trim()
        ? args.brief.trim()
        : pack.intent;
    const output_contract =
      args.output_contract === "prose_brief" || args.output_contract === "both"
        ? args.output_contract
        : "layout_hints_json";
    return assembleDesignPromptPack({ brief, pack, output_contract });
  }
  const { deriveLayoutFromReferencePack } = await import("./layout-generation.js");
  const specification = deriveLayoutFromReferencePack({ pack, layout_hints: null, graph: null });
  return { pack, specification };
}

export async function callDigLibraryTool(
  name: Extract<McpToolName, "dig_screen_search" | "dig_capture_prompt_pack">,
  args: Record<string, unknown>
): Promise<unknown> {
  const platformProjectId =
    typeof args.platformProjectId === "string"
      ? args.platformProjectId
      : typeof args.platform_project_id === "string"
        ? args.platform_project_id
        : null;
  if (name === "dig_screen_search") {
    const { assertCollectionScopeAllowed } = await import("./design-reference-library.js");
    const { getPool } = await import("./db.js");
    const {
      libraryScreenFacetCatalog,
      listLibraryScreens,
      publicLibraryScreenHit
    } = await import("./library-screens.js");
    assertCollectionScopeAllowed(platformProjectId);
    const client = getPool();
    if (!client) throw new Error("database_unavailable");
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(20, Math.floor(args.limit)))
        : 20;
    const listed = await listLibraryScreens(client, {
      style: typeof args.style === "string" ? args.style : undefined,
      layout: typeof args.layout === "string" ? args.layout : undefined,
      industry: typeof args.industry === "string" ? args.industry : undefined,
      platformProjectId,
      limit: 200
    });
    const screens = listed.slice(0, limit).map(publicLibraryScreenHit);
    return { count: screens.length, screens, ...libraryScreenFacetCatalog() };
  }
  const captureRunId =
    typeof args.capture_run_id === "string"
      ? args.capture_run_id
      : typeof args.captureRunId === "string"
        ? args.captureRunId
        : "";
  if (!captureRunId.trim()) throw new Error("capture_run_id required");
  const { assemblePromptPackForCaptureRunFromPool } = await import("./capture-prompt-pack.js");
  return assemblePromptPackForCaptureRunFromPool(captureRunId.trim(), args);
}

export async function callDigFlowTool(
  name: Extract<McpToolName, "dig_flow_search" | "dig_flow_get" | "dig_flow_neighbors">,
  args: Record<string, unknown>
): Promise<unknown> {
  const { digFlowSearch, digFlowGet, digFlowNeighbors } = await import("./flow-library.js");
  if (name === "dig_flow_search") {
    return digFlowSearch({
      ...(typeof args.flow_action === "string" ? { flow_action: args.flow_action } : {}),
      ...(typeof args.app_scope_id === "string" ? { app_scope_id: args.app_scope_id } : {}),
      ...(typeof args.q === "string" ? { q: args.q } : {}),
      ...(typeof args.limit === "number" ? { limit: args.limit } : {})
    });
  }
  if (name === "dig_flow_get") {
    const detail = await digFlowGet(String(args.flow_id ?? ""));
    if (!detail) throw new Error(`Unknown flow_id: ${String(args.flow_id ?? "")}`);
    return detail;
  }
  const neighbors = await digFlowNeighbors(String(args.flow_id ?? ""), String(args.flow_screen_id ?? ""));
  if (!neighbors) throw new Error(`Unknown flow_id: ${String(args.flow_id ?? "")}`);
  return neighbors;
}

export function toolResult(value: unknown) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }; }
