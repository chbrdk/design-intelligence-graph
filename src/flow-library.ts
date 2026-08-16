/**
 * DIG-011 Phase D — file-backed flow library + MCP helpers (no PG yet).
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  projectFlowGraphToInteractive,
  projectFlowGraphToListItem,
  projectFlowGraphToNeighbors,
  type FlowGraphLike,
  type FlowScreenMediaMap
} from "./flow-api-project.js";
import type { FlowGraphDocument } from "./flow-assemble.js";
import { listFlowActions } from "./flow-actions.js";
import { resolveRepoRoot } from "./repo-root.js";
import { loadDigPaths, indexesDirectory, libraryApiPath } from "./runtime-paths.js";
import type { Queryable } from "./db.js";

export type FlowGraph = FlowGraphDocument & FlowGraphLike;

let testStore: FlowGraph[] | null = null;

export function setFlowLibraryStoreForTests(graphs: FlowGraph[] | null): void {
  testStore = graphs;
}

function asFlowGraph(value: unknown): FlowGraph | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.flow_id !== "string" || !Array.isArray(record.screens) || !Array.isArray(record.edges)) {
    return null;
  }
  return value as FlowGraph;
}

async function loadGraphsFromDir(dir: string): Promise<FlowGraph[]> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const graphs: FlowGraph[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readFile(join(dir, name), "utf8")) as unknown;
      const graph = asFlowGraph(parsed);
      if (graph) graphs.push(graph);
    } catch {
      /* skip */
    }
  }
  return graphs;
}

async function loadGoldenFixtureGraphs(): Promise<FlowGraph[]> {
  const root = resolveRepoRoot();
  const paths = loadDigPaths() as { taxonomy?: { flowFixturesDir?: string } };
  const fixturesDir = resolve(root, paths.taxonomy?.flowFixturesDir ?? "fixtures/flows");
  let names: string[] = [];
  try {
    names = await readdir(fixturesDir);
  } catch {
    return [];
  }
  const graphs: FlowGraph[] = [];
  for (const name of names.sort()) {
    if (name.startsWith("_") || name === "api") continue;
    try {
      const parsed = JSON.parse(await readFile(join(fixturesDir, name, "flow-graph.json"), "utf8"));
      const graph = asFlowGraph(parsed);
      if (graph) graphs.push(graph);
    } catch {
      /* skip */
    }
  }
  return graphs;
}

export async function loadFlowLibraryGraphs(options: { includeFixtures?: boolean } = {}): Promise<FlowGraph[]> {
  if (testStore) return testStore;
  const paths = loadDigPaths() as {
    flowLibrary?: { graphsRelativeDir?: string; includeFixturesWhenEmpty?: boolean };
  };
  const relative = paths.flowLibrary?.graphsRelativeDir ?? "flows";
  const dir = resolve(indexesDirectory(), relative);
  const indexed = await loadGraphsFromDir(dir);
  const includeFixtures =
    options.includeFixtures ??
    paths.flowLibrary?.includeFixturesWhenEmpty ??
    indexed.length === 0;
  if (indexed.length) return indexed;
  if (includeFixtures) return loadGoldenFixtureGraphs();
  return [];
}

export function filterFlowGraphs(
  graphs: FlowGraph[],
  query: {
    flow_action?: string | null;
    app_scope_id?: string | null;
    q?: string | null;
    limit?: number;
  }
): FlowGraph[] {
  const limit = Math.max(1, Math.min(50, query.limit ?? 20));
  const action = query.flow_action?.trim().toLowerCase() ?? "";
  const scope = query.app_scope_id?.trim() ?? "";
  const q = query.q?.trim().toLowerCase() ?? "";

  let actionId = action;
  if (action && !action.startsWith("dig:flow.")) {
    const match = listFlowActions().find(
      (term) =>
        term.id.toLowerCase() === action ||
        term.label.toLowerCase().includes(action) ||
        term.aliases.some((alias) => alias.toLowerCase().includes(action))
    );
    actionId = match?.id.toLowerCase() ?? action;
  }

  return graphs
    .filter((graph) => {
      if (scope && graph.app_scope_id !== scope) return false;
      if (actionId) {
        const ids = (graph.flow_actions ?? []).map((item) => item.taxonomy_id.toLowerCase());
        if (!ids.some((id) => id === actionId || id.includes(actionId))) return false;
      }
      if (q) {
        const hay = `${graph.title ?? ""} ${graph.notes ?? ""} ${graph.flow_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => a.flow_id.localeCompare(b.flow_id))
    .slice(0, limit);
}

export function listFlowsEnvelope(graphs: FlowGraph[], query: Parameters<typeof filterFlowGraphs>[1]) {
  const items = filterFlowGraphs(graphs, query).map(projectFlowGraphToListItem);
  return { schema_version: "0.1.0" as const, items };
}

export function getFlowInteractiveEnvelope(
  graph: FlowGraph,
  mediaByScreenId: FlowScreenMediaMap = {}
) {
  return projectFlowGraphToInteractive(graph, mediaByScreenId);
}

export function getFlowDetailEnvelope(
  graph: FlowGraph,
  mediaByScreenId: FlowScreenMediaMap = {}
) {
  const media: Record<string, { primary_image_path: string | null; checkion_scan_id: string | null }> =
    {};
  for (const screen of graph.screens) {
    const hit = mediaByScreenId[screen.flow_screen_id];
    media[screen.flow_screen_id] = {
      primary_image_path: hit?.image_ref ?? null,
      checkion_scan_id: screen.checkion_scan_id ?? null
    };
  }
  return {
    schema_version: "0.1.0" as const,
    flow: graph,
    media
  };
}

export function getFlowNeighborsEnvelope(graph: FlowGraph, flowScreenId: string) {
  return projectFlowGraphToNeighbors(graph, flowScreenId);
}

export async function digFlowSearch(args: {
  flow_action?: string;
  app_scope_id?: string;
  q?: string;
  limit?: number;
}) {
  const graphs = await loadFlowLibraryGraphs();
  return listFlowsEnvelope(graphs, args);
}

export async function digFlowGet(flowId: string) {
  const graphs = await loadFlowLibraryGraphs();
  const graph = graphs.find((item) => item.flow_id === flowId);
  if (!graph) return null;
  return getFlowDetailEnvelope(graph);
}

export async function digFlowNeighbors(flowId: string, flowScreenId: string) {
  const graphs = await loadFlowLibraryGraphs();
  const graph = graphs.find((item) => item.flow_id === flowId);
  if (!graph) return null;
  return getFlowNeighborsEnvelope(graph, flowScreenId);
}

function mediaApiUrl(captureRunId: string, relativePath: string | null): string | null {
  if (!relativePath) return null;
  const base = libraryApiPath().replace(/\/$/, "");
  return `${base}/media?capture_run_id=${encodeURIComponent(captureRunId)}&path=${encodeURIComponent(relativePath)}`;
}

/** Resolve desktop (or first) viewport screenshots for flow screens via captures DB. */
export async function resolveFlowScreenMedia(
  client: Queryable,
  screens: Array<{ flow_screen_id: string; capture_run_id: string; primary_url?: string | null }>
): Promise<FlowScreenMediaMap> {
  const map: FlowScreenMediaMap = {};
  for (const screen of screens) {
    map[screen.flow_screen_id] = {
      image_ref: null,
      primary_url: screen.primary_url ?? null
    };
  }
  const captureIds = [...new Set(screens.map((screen) => screen.capture_run_id))];
  if (!captureIds.length) return map;

  const result = await client.query(
    `SELECT capture_run_id, name, settled_screenshot_path, full_page_screenshot_path
     FROM viewports
     WHERE capture_run_id = ANY($1::text[])
     ORDER BY CASE WHEN name = 'desktop' THEN 0 ELSE 1 END, name ASC`,
    [captureIds]
  );

  const bestByCapture = new Map<
    string,
    { name: string; settled_screenshot_path: string | null; full_page_screenshot_path: string | null }
  >();
  for (const row of result.rows as Array<{
    capture_run_id: string;
    name: string;
    settled_screenshot_path: string | null;
    full_page_screenshot_path: string | null;
  }>) {
    const existing = bestByCapture.get(row.capture_run_id);
    if (!existing || (row.name === "desktop" && existing.name !== "desktop")) {
      bestByCapture.set(row.capture_run_id, row);
    }
  }

  for (const screen of screens) {
    const shot = bestByCapture.get(screen.capture_run_id);
    const relative = shot?.full_page_screenshot_path || shot?.settled_screenshot_path || null;
    map[screen.flow_screen_id] = {
      image_ref: mediaApiUrl(screen.capture_run_id, relative),
      primary_url: screen.primary_url ?? null
    };
  }
  return map;
}

export async function indexFlowGraph(graph: FlowGraphDocument): Promise<string> {
  const paths = loadDigPaths() as { flowLibrary?: { graphsRelativeDir?: string } };
  const relative = paths.flowLibrary?.graphsRelativeDir ?? "flows";
  const dir = resolve(indexesDirectory(), relative);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${graph.flow_id}.json`);
  await writeFile(filePath, JSON.stringify(graph, null, 2));
  return filePath;
}

export type { FlowScreenMediaMap };
