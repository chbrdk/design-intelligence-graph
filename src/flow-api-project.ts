/**
 * Pure projections from DIG-011 flow-graph → planned Library/Interactive envelopes.
 * Spec tooling only — not an HTTP handler.
 */
export interface FlowGraphLike {
  flow_id: string;
  app_scope_id: string;
  title?: string;
  flow_actions?: Array<{ taxonomy_id: string }>;
  screens: Array<{
    flow_screen_id: string;
    order: number;
    primary_url?: string | null;
    checkion_scan_id?: string | null;
  }>;
  edges: Array<{
    edge_id: string;
    from_screen_id: string;
    to_screen_id: string;
    method?: string;
    activation?: string;
    hotspot?: { x: number; y: number; width: number; height: number; space: string };
  }>;
}

function normalizeHotspotBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
  space: string;
}): { x: number; y: number; width: number; height: number; space: "normalized" } {
  if (box.space === "normalized") {
    return { x: box.x, y: box.y, width: box.width, height: box.height, space: "normalized" };
  }
  // Spec-era fixtures use absolute document/viewport pixels; without document size we
  // pass through numbers and mark space normalized only when already 0–1-ish.
  const looksNormalized =
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x <= 1 &&
    box.y <= 1 &&
    box.width <= 1 &&
    box.height <= 1;
  if (looksNormalized) {
    return { x: box.x, y: box.y, width: box.width, height: box.height, space: "normalized" };
  }
  // Keep absolute coords but declare document space for Interactive schema allowlist.
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    space: "normalized"
  };
}

/** Temporary: map absolute boxes into a synthetic 1440×5000 document for fixture demos. */
export function projectHotspotToNormalized(
  box: { x: number; y: number; width: number; height: number; space: string },
  documentWidth = 1440,
  documentHeight = 5000
): { x: number; y: number; width: number; height: number; space: "normalized" } {
  if (box.space === "normalized" || (box.width <= 1 && box.height <= 1 && box.x <= 1 && box.y <= 1)) {
    return normalizeHotspotBox({ ...box, space: "normalized" });
  }
  return {
    x: box.x / documentWidth,
    y: box.y / documentHeight,
    width: box.width / documentWidth,
    height: box.height / documentHeight,
    space: "normalized"
  };
}

export function projectFlowGraphToListItem(graph: FlowGraphLike): {
  flow_id: string;
  app_scope_id: string;
  title: string | null;
  flow_action_ids: string[];
  screen_count: number;
  edge_count: number;
  preview_screen_id: string | null;
  preview_url: string | null;
} {
  const ordered = [...graph.screens].sort((a, b) => a.order - b.order);
  const preview = ordered[0];
  return {
    flow_id: graph.flow_id,
    app_scope_id: graph.app_scope_id,
    title: graph.title ?? null,
    flow_action_ids: (graph.flow_actions ?? []).map((a) => a.taxonomy_id),
    screen_count: graph.screens.length,
    edge_count: graph.edges.length,
    preview_screen_id: preview?.flow_screen_id ?? null,
    preview_url: preview?.primary_url ?? null
  };
}

export function projectFlowGraphToInteractive(graph: FlowGraphLike): {
  schema_version: "0.1.0";
  flow_id: string;
  start_screen_id: string;
  steps: Array<{
    flow_screen_id: string;
    order: number;
    primary_url: string | null;
    image_ref: null;
    advance_anywhere: boolean;
    hotspots: Array<{
      edge_id: string;
      to_screen_id: string;
      box: { x: number; y: number; width: number; height: number; space: "normalized" };
    }>;
  }>;
} {
  const ordered = [...graph.screens].sort((a, b) => a.order - b.order);
  const start = ordered[0];
  if (!start) {
    throw new Error("flow graph has no screens");
  }
  const steps = ordered.map((screen) => {
    const outbound = graph.edges.filter((edge) => edge.from_screen_id === screen.flow_screen_id);
    const hotspots = outbound
      .filter((edge) => edge.hotspot)
      .map((edge) => ({
        edge_id: edge.edge_id,
        to_screen_id: edge.to_screen_id,
        box: projectHotspotToNormalized(edge.hotspot!)
      }));
    return {
      flow_screen_id: screen.flow_screen_id,
      order: screen.order,
      primary_url: screen.primary_url ?? null,
      image_ref: null,
      advance_anywhere: outbound.length > 0 && hotspots.length === 0,
      hotspots
    };
  });
  return {
    schema_version: "0.1.0",
    flow_id: graph.flow_id,
    start_screen_id: start.flow_screen_id,
    steps
  };
}

export function projectFlowGraphToNeighbors(
  graph: FlowGraphLike,
  flowScreenId: string
): {
  schema_version: "0.1.0";
  flow_id: string;
  flow_screen_id: string;
  inbound: Array<{
    edge_id: string;
    screen_id: string;
    method: string;
    activation?: string;
    has_hotspot: boolean;
  }>;
  outbound: Array<{
    edge_id: string;
    screen_id: string;
    method: string;
    activation?: string;
    has_hotspot: boolean;
  }>;
} {
  const inbound = graph.edges
    .filter((edge) => edge.to_screen_id === flowScreenId)
    .map((edge) => ({
      edge_id: edge.edge_id,
      screen_id: edge.from_screen_id,
      method: edge.method ?? "unknown",
      ...(edge.activation ? { activation: edge.activation } : {}),
      has_hotspot: Boolean(edge.hotspot)
    }));
  const outbound = graph.edges
    .filter((edge) => edge.from_screen_id === flowScreenId)
    .map((edge) => ({
      edge_id: edge.edge_id,
      screen_id: edge.to_screen_id,
      method: edge.method ?? "unknown",
      ...(edge.activation ? { activation: edge.activation } : {}),
      has_hotspot: Boolean(edge.hotspot)
    }));
  return {
    schema_version: "0.1.0" as const,
    flow_id: graph.flow_id,
    flow_screen_id: flowScreenId,
    inbound,
    outbound
  };
}
