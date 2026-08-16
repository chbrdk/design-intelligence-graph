/**
 * DIG-011 Phase D — assemble flow-graph.json from screens, edges, and detected actions.
 * Spec: docs/DIG-011-phase-d-process.md
 */

import { createHash } from "node:crypto";
import { writeArtifact } from "./io.js";
import type { FlowActionAssignment } from "./flow-detect.js";
import type { FlowEdge } from "./flow-edges.js";
import type { ArtifactReference } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";

export const FLOW_GRAPH_SCHEMA_VERSION = "0.1.0";
export const FLOW_GRAPH_RELATIVE_PATH = "derived/flow-graph.json";

export interface AssembledFlowScreen {
  flow_screen_id: string;
  order: number;
  capture_run_id: string;
  checkion_scan_id?: string | null;
  primary_url?: string | null;
}

export interface AssembledFlowEdge {
  edge_id: string;
  from_screen_id: string;
  to_screen_id: string;
  trigger: FlowEdge["trigger"];
  hotspot?: FlowEdge["hotspot"];
  activation: FlowEdge["activation"];
  method: string;
  confidence: number;
  provenance: { layer: "L1" | "L2"; evidence_refs?: string[] };
}

export interface FlowGraphDocument {
  flow_schema_version: "0.1.0";
  flow_id: string;
  app_scope_id: string;
  flow_session_id: string | null;
  title?: string;
  notes?: string;
  flow_actions: FlowActionAssignment[];
  screens: AssembledFlowScreen[];
  edges: AssembledFlowEdge[];
}

export interface FlowAssembleScreenInput {
  capture_run_id: string;
  primary_url?: string | null;
  checkion_scan_id?: string | null;
  flow_screen_id?: string;
  order?: number;
}

function stableFlowId(parts: string[]): string {
  return `flow_${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

function defaultScreenId(captureRunId: string): string {
  return `fs_${captureRunId.replace(/^cap_|^run_/, "").slice(0, 16)}`;
}

/**
 * Order screens: prefer explicit order; else follow highest-confidence edge path from roots;
 * remaining screens append by capture_run_id.
 */
export function orderFlowScreens(
  screens: FlowAssembleScreenInput[],
  edges: FlowEdge[]
): AssembledFlowScreen[] {
  const withIds = screens.map((screen, index) => ({
    flow_screen_id: screen.flow_screen_id || defaultScreenId(screen.capture_run_id),
    capture_run_id: screen.capture_run_id,
    checkion_scan_id: screen.checkion_scan_id ?? null,
    primary_url: screen.primary_url ?? null,
    explicitOrder: screen.order,
    index
  }));

  if (withIds.every((screen) => typeof screen.explicitOrder === "number")) {
    return withIds
      .map((screen) => ({
        flow_screen_id: screen.flow_screen_id,
        order: screen.explicitOrder as number,
        capture_run_id: screen.capture_run_id,
        checkion_scan_id: screen.checkion_scan_id,
        primary_url: screen.primary_url
      }))
      .sort((a, b) => a.order - b.order || a.flow_screen_id.localeCompare(b.flow_screen_id));
  }

  const byCapture = new Map(withIds.map((screen) => [screen.capture_run_id, screen]));
  const adjacency = new Map<string, Array<{ to: string; confidence: number }>>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from_capture_run_id) ?? [];
    list.push({ to: edge.to_capture_run_id, confidence: edge.confidence });
    adjacency.set(edge.from_capture_run_id, list);
  }
  for (const [, list] of adjacency) {
    list.sort((a, b) => b.confidence - a.confidence || a.to.localeCompare(b.to));
  }

  const inbound = new Set(edges.map((edge) => edge.to_capture_run_id));
  const roots = withIds
    .map((screen) => screen.capture_run_id)
    .filter((id) => !inbound.has(id))
    .sort();
  if (!roots.length && withIds.length) {
    roots.push([...withIds].sort((a, b) => a.capture_run_id.localeCompare(b.capture_run_id))[0]!.capture_run_id);
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const walk = (captureId: string) => {
    if (seen.has(captureId) || !byCapture.has(captureId)) return;
    seen.add(captureId);
    orderedIds.push(captureId);
    for (const next of adjacency.get(captureId) ?? []) walk(next.to);
  };
  for (const root of roots) walk(root);
  for (const screen of withIds.sort((a, b) => a.capture_run_id.localeCompare(b.capture_run_id))) {
    if (!seen.has(screen.capture_run_id)) {
      seen.add(screen.capture_run_id);
      orderedIds.push(screen.capture_run_id);
    }
  }

  return orderedIds.map((captureId, order) => {
    const screen = byCapture.get(captureId)!;
    return {
      flow_screen_id: screen.flow_screen_id,
      order,
      capture_run_id: screen.capture_run_id,
      checkion_scan_id: screen.checkion_scan_id,
      primary_url: screen.primary_url
    };
  });
}

export function assembleFlowGraph(input: {
  flowId?: string;
  appScopeId: string;
  flowSessionId?: string | null;
  title?: string;
  notes?: string;
  screens: FlowAssembleScreenInput[];
  edges: FlowEdge[];
  flow_actions: FlowActionAssignment[];
}): FlowGraphDocument {
  if (!input.screens.length) throw new Error("assembleFlowGraph requires ≥1 screen");
  const screens = orderFlowScreens(input.screens, input.edges);
  const screenByCapture = new Map(screens.map((screen) => [screen.capture_run_id, screen]));
  const flowId =
    input.flowId ||
    stableFlowId([
      input.appScopeId,
      input.flowSessionId ?? "",
      ...screens.map((screen) => screen.capture_run_id)
    ]);

  const edges: AssembledFlowEdge[] = [];
  for (const edge of input.edges) {
    const from = screenByCapture.get(edge.from_capture_run_id);
    const to = screenByCapture.get(edge.to_capture_run_id);
    if (!from || !to) continue;
    const assembled: AssembledFlowEdge = {
      edge_id: edge.edge_id,
      from_screen_id: from.flow_screen_id,
      to_screen_id: to.flow_screen_id,
      trigger: edge.trigger,
      activation: edge.activation,
      method: edge.method,
      confidence: edge.confidence,
      provenance: edge.provenance
    };
    if (edge.hotspot) {
      assembled.hotspot = {
        ...edge.hotspot,
        space: edge.hotspot.space === "viewport" ? "viewport" : "document"
      };
    }
    edges.push(assembled);
  }
  edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id));

  const document: FlowGraphDocument = {
    flow_schema_version: "0.1.0",
    flow_id: flowId,
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? null,
    flow_actions: input.flow_actions,
    screens,
    edges
  };
  if (input.title) document.title = input.title;
  if (input.notes) document.notes = input.notes;
  return document;
}

export async function emitFlowGraph(
  root: string,
  document: FlowGraphDocument,
  options: { relativePath?: string } = {}
): Promise<{ path: string; artifact: ArtifactReference; document: FlowGraphDocument }> {
  const paths = loadDigPaths() as { flowGraph?: { relativePath?: string } };
  const relative =
    options.relativePath ?? paths.flowGraph?.relativePath ?? FLOW_GRAPH_RELATIVE_PATH;
  const artifact = await writeArtifact(root, relative, JSON.stringify(document, null, 2), "application/json");
  return { path: relative, artifact, document };
}
