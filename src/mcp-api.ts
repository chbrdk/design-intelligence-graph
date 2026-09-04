import { readFile } from "node:fs/promises";
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from "./storage.js";
import { searchKnowledgeGraph } from "./storage.js";
import { getPool } from "./db.js";
import {
  callSpirionTool,
  isSpirionToolName,
  listSpirionTools,
  SPIRION_DIG_ALIASES,
  type SpirionToolName
} from "./mcp-spirion.js";
import { loadDigPaths } from "./runtime-paths.js";

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
  | "dig_compose_brief"
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
  "dig_compose_brief",
  "dig_generate"
]);

const LIBRARY_TOOL_NAMES = new Set<McpToolName>(["dig_screen_search", "dig_capture_prompt_pack"]);

const FLOW_TOOL_NAMES = new Set<McpToolName>([
  "dig_flow_search",
  "dig_flow_get",
  "dig_flow_neighbors"
]);

export function emptyKnowledgeGraph(): KnowledgeGraph {
  return {
    schema_version: "0.1.0",
    storage_model_version: "0.1.0",
    source_capture_run_id: "cap_mcp_empty",
    indexed_at: "2026-01-01T00:00:00.000Z",
    nodes: [],
    edges: [],
    lineage: []
  };
}

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
    ...listSpirionTools(),
    { name: "dig_search", description: "Search DIG graph nodes by deterministic substring match.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "number" }, type: { type: "string" } } } },
    { name: "dig_inspect", description: "Inspect a graph node with directly incident edges.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" } } } },
    { name: "dig_neighbors", description: "Retrieve typed graph neighbors to a bounded depth of one.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" }, edge_type: { type: "string" }, limit: { type: "number" } } } },
    { name: "dig_compare", description: "Compare two graph nodes by type, properties, and shared neighbor IDs.", inputSchema: { type: "object", required: ["left_node_id", "right_node_id"], properties: { left_node_id: { type: "string" }, right_node_id: { type: "string" } } } },
    { name: "dig_recommend", description: "Recommend nodes with the same type or taxonomy as a seed node; deterministic, not model-ranked.", inputSchema: { type: "object", required: ["node_id"], properties: { node_id: { type: "string" }, limit: { type: "number" } } } },
    {
      name: "dig_reference_search",
      description:
        "Search Collection-scoped DesignReferences (DIG-012). Filter by style/layout/industry plus craft atoms. Live mode requires platformProjectId.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string" },
          query: { type: "string" },
          category: { type: "string" },
          signature: { type: "string" },
          style_label: { type: "string" },
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          modules: { type: "array", items: { type: "string" } },
          craft_tags: { type: "array", items: { type: "string" } },
          imagery_density: { type: "string" },
          type_scale: { type: "string" },
          type_image_mode: { type: "string" },
          contrast_mode: { type: "string" },
          composition_energy: { type: "string" },
          chrome_weight: { type: "string" },
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
      name: "dig_compose_brief",
      description: "Compose a builder-facing brief from references and/or captures with merged craft, look_contract, and page_rhythm.",
      inputSchema: {
        type: "object",
        required: ["intent"],
        properties: {
          intent: { type: "string" },
          brief: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          capture_run_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          primary_screen_id: { type: "string" },
          output_contract: { type: "string", enum: ["layout_hints_json", "prose_brief", "both"] },
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
        "Search captured Library screens. Facet filters apply first; natural-language q ranks with dense embeddings (provider=dense default when q is set).",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string" },
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          modules: { type: "array", items: { type: "string" } },
          craft_tags: { type: "array", items: { type: "string" } },
          imagery_density: { type: "string" },
          type_scale: { type: "string" },
          type_image_mode: { type: "string" },
          contrast_mode: { type: "string" },
          composition_energy: { type: "string" },
          chrome_weight: { type: "string" },
          value_key: { type: "string" },
          palette: { type: "string" },
          screen_pattern: { type: "string" },
          provider: { type: "string", enum: ["dense", "hashing", "screenshot"] },
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
    | "dig_compose_brief"
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
      q: typeof args.q === "string" ? args.q : undefined,
      query: typeof args.query === "string" ? args.query : undefined,
      category: typeof args.category === "string" ? args.category : undefined,
      signature: typeof args.signature === "string" ? args.signature : undefined,
      style_label: typeof args.style_label === "string" ? args.style_label : undefined,
      style: typeof args.style === "string" ? args.style : undefined,
      layout: typeof args.layout === "string" ? args.layout : undefined,
      industry: typeof args.industry === "string" ? args.industry : undefined,
      modules: Array.isArray(args.modules) ? args.modules.filter((item): item is string => typeof item === "string") : undefined,
      craft_tags: Array.isArray(args.craft_tags)
        ? args.craft_tags.filter((item): item is string => typeof item === "string")
        : undefined,
      imagery_density: typeof args.imagery_density === "string" ? args.imagery_density : undefined,
      type_scale: typeof args.type_scale === "string" ? args.type_scale : undefined,
      type_image_mode: typeof args.type_image_mode === "string" ? args.type_image_mode : undefined,
      contrast_mode: typeof args.contrast_mode === "string" ? args.contrast_mode : undefined,
      composition_energy: typeof args.composition_energy === "string" ? args.composition_energy : undefined,
      chrome_weight: typeof args.chrome_weight === "string" ? args.chrome_weight : undefined,
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
  if (name === "dig_compose_brief") {
    const { assembleCompositionBrief } = await import("./compose-brief.js");
    return assembleCompositionBrief(
      {
        ...args,
        ...(platformProjectId ? { platformProjectId } : {})
      },
      getPool()
    );
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
  const { digApiBaseUrl, mcpHttpClientEnabled } = await import("./runtime-paths.js");
  if (mcpHttpClientEnabled()) {
    const apiBase = digApiBaseUrl();
    if (apiBase) {
      const { callDigLibraryToolHttp } = await import("./mcp-library-http.js");
      return callDigLibraryToolHttp(name, args, apiBase);
    }
  }
  const platformProjectId =
    typeof args.platformProjectId === "string"
      ? args.platformProjectId
      : typeof args.platform_project_id === "string"
        ? args.platform_project_id
        : null;
  if (name === "dig_screen_search") {
    const { assertCollectionScopeAllowed } = await import("./design-reference-library.js");
    const { getPool } = await import("./db.js");
    const { libraryScreenFacetCatalog, publicLibraryScreenHit } = await import("./library-screens.js");
    const { resolveScreenSearchProvider, searchLibraryScreens } = await import("./library-screen-rank.js");
    assertCollectionScopeAllowed(platformProjectId);
    const client = getPool();
    if (!client) throw new Error("database_unavailable");
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(40, Math.floor(args.limit)))
        : 20;
    const provider = resolveScreenSearchProvider(
      typeof args.provider === "string" ? args.provider : null,
      typeof args.q === "string" ? args.q : null
    );
    const searched = await searchLibraryScreens(client, {
      q: typeof args.q === "string" ? args.q : undefined,
      provider,
      limit,
      style: typeof args.style === "string" ? args.style : undefined,
      layout: typeof args.layout === "string" ? args.layout : undefined,
      industry: typeof args.industry === "string" ? args.industry : undefined,
      modules: Array.isArray(args.modules) ? args.modules.filter((item): item is string => typeof item === "string") : undefined,
      craft_tags: Array.isArray(args.craft_tags)
        ? args.craft_tags.filter((item): item is string => typeof item === "string")
        : undefined,
      imagery_density: typeof args.imagery_density === "string" ? args.imagery_density : undefined,
      type_scale: typeof args.type_scale === "string" ? args.type_scale : undefined,
      type_image_mode: typeof args.type_image_mode === "string" ? args.type_image_mode : undefined,
      contrast_mode: typeof args.contrast_mode === "string" ? args.contrast_mode : undefined,
      composition_energy: typeof args.composition_energy === "string" ? args.composition_energy : undefined,
      chrome_weight: typeof args.chrome_weight === "string" ? args.chrome_weight : undefined,
      value_key: typeof args.value_key === "string" ? args.value_key : undefined,
      palette: typeof args.palette === "string" ? args.palette : undefined,
      screen_pattern: typeof args.screen_pattern === "string" ? args.screen_pattern : undefined,
      platformProjectId
    });
    const screens = searched.screens.map(publicLibraryScreenHit);
    return {
      count: screens.length,
      screens,
      provider: searched.provider,
      retrieval: searched.retrieval,
      ...(searched.inferred_facets?.length ? { inferred_facets: searched.inferred_facets } : {}),
      ...libraryScreenFacetCatalog()
    };
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

export function toolResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export type McpJsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export async function handleMcpMessage(
  graph: KnowledgeGraph,
  request: McpJsonRpcRequest
): Promise<{ jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } } | null> {
  const id = request.id ?? null;
  const method = request.method ?? "";
  if (method.startsWith("notifications/")) return null;
  try {
    let result: unknown;
    if (method === "initialize") {
      const requested =
        typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : "";
      const protocolVersion = ["2025-11-25", "2025-03-26", "2024-11-05"].includes(requested)
        ? requested
        : "2025-03-26";
      result = {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: {
          name: loadDigPaths().cursorMcp?.serverName ?? loadDigPaths().mcpSpirion?.serverName ?? "spirion",
          version: "0.1.0"
        }
      };
    } else if (method === "ping") {
      result = {};
    } else if (method === "tools/list") {
      result = { tools: listDigTools() };
    } else if (method === "tools/call") {
      const params = request.params ?? {};
      const requestedName = String(params.name);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const alias = SPIRION_DIG_ALIASES[requestedName];
      const name = (alias ?? requestedName) as McpToolName;
      if (isSpirionToolName(requestedName) && !alias) {
        result = toolResult(await callSpirionTool(requestedName as SpirionToolName, args));
      } else if (
        name === "dig_reference_search" ||
        name === "dig_reference_get" ||
        name === "dig_reference_pack" ||
        name === "dig_reference_prompt_pack" ||
        name === "dig_generate"
      ) {
        result = toolResult(await callDigReferenceTool(name, args));
      } else if (name === "dig_screen_search" || name === "dig_capture_prompt_pack") {
        result = toolResult(await callDigLibraryTool(name, args));
      } else if (name === "dig_flow_search" || name === "dig_flow_get" || name === "dig_flow_neighbors") {
        result = toolResult(await callDigFlowTool(name, args));
      } else {
        result = toolResult(callDigTool(graph, name, args));
      }
    } else {
      throw new Error(`Unsupported method: ${method}`);
    }
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: error instanceof Error ? error.message : String(error) }
    };
  }
}
