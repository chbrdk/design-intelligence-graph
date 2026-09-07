/**
 * DIG-011 same-site flow discovery from the capture corpus (href graph).
 * No fixed industry journeys — clusters by host, joins via Phase A candidates.
 */
import type { Queryable } from "./db.js";
import { assembleFlowGraph } from "./flow-assemble.js";
import { detectFlowActionsL2 } from "./flow-detect.js";
import {
  hrefJoinEdges,
  loadFlowScreenFromPackage,
  normalizeFlowJoinUrl,
  type FlowScreenRef
} from "./flow-edges.js";
import { indexFlowGraph } from "./flow-library.js";
import { loadDigPaths } from "./runtime-paths.js";
import { stableAppScopeFromRootUrl } from "./flow-seed.js";

export type FlowDiscoverCaptureRow = {
  capture_run_id: string;
  canonical_url: string;
  package_path: string;
  site_domain?: string | null;
};

export type FlowDiscoverSiteResult = {
  host: string;
  app_scope_id: string;
  screen_count: number;
  href_edge_count: number;
  hotspot_count: number;
  flow_id: string | null;
  flow_action_ids: string[];
  skipped_reason?: string;
};

const SKIP_HOSTS = new Set([
  "",
  "localhost",
  "127.0.0.1",
  "chromewebdata",
  "about:blank"
]);

export function hostFromCapture(row: {
  canonical_url: string;
  site_domain?: string | null;
}): string | null {
  const domain = row.site_domain?.trim().toLowerCase();
  if (domain && !SKIP_HOSTS.has(domain) && !domain.includes(" ")) return domain;
  try {
    const host = new URL(row.canonical_url).hostname.toLowerCase();
    if (!host || SKIP_HOSTS.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function clusterCapturesByHost(
  rows: FlowDiscoverCaptureRow[],
  options: { maxScreensPerSite?: number } = {}
): Map<string, FlowDiscoverCaptureRow[]> {
  const maxScreens = Math.max(2, Math.min(50, options.maxScreensPerSite ?? 12));
  const clusters = new Map<string, FlowDiscoverCaptureRow[]>();
  const seenUrl = new Set<string>();
  for (const row of rows) {
    const host = hostFromCapture(row);
    if (!host) continue;
    const join = normalizeFlowJoinUrl(row.canonical_url);
    if (!join) continue;
    const dedupeKey = `${host}|${join}`;
    if (seenUrl.has(dedupeKey)) continue;
    seenUrl.add(dedupeKey);
    const list = clusters.get(host) ?? [];
    if (list.length >= maxScreens) continue;
    list.push(row);
    clusters.set(host, list);
  }
  return clusters;
}

export async function listCapturesForFlowDiscover(
  client: Queryable,
  limit = 2000
): Promise<FlowDiscoverCaptureRow[]> {
  const capped = Math.max(50, Math.min(5000, Math.floor(limit)));
  const result = await client.query(
    `SELECT capture_run_id, canonical_url, package_path, site_domain
     FROM captures
     WHERE package_path IS NOT NULL
       AND canonical_url IS NOT NULL
     ORDER BY indexed_at DESC NULLS LAST
     LIMIT $1`,
    [capped]
  );
  return (result.rows as Array<Record<string, unknown>>)
    .map((row) => ({
      capture_run_id: String(row.capture_run_id ?? ""),
      canonical_url: String(row.canonical_url ?? ""),
      package_path: String(row.package_path ?? ""),
      site_domain: row.site_domain != null ? String(row.site_domain) : null
    }))
    .filter((row) => row.capture_run_id && row.canonical_url && row.package_path);
}

export async function discoverFlowsFromCaptures(
  rows: FlowDiscoverCaptureRow[],
  options: {
    minScreens?: number;
    maxScreensPerSite?: number;
    maxSites?: number;
    minHrefEdges?: number;
    indexLibrary?: boolean;
    hostAllowlist?: string[];
  } = {}
): Promise<{
  sites_considered: number;
  indexed: FlowDiscoverSiteResult[];
  skipped: FlowDiscoverSiteResult[];
}> {
  const paths = loadDigPaths() as {
    flowDiscover?: { minScreens?: number; maxScreensPerSite?: number; maxSites?: number; minHrefEdges?: number };
  };
  const cfg = paths.flowDiscover ?? {};
  const minScreens = options.minScreens ?? cfg.minScreens ?? 2;
  const maxScreensPerSite = options.maxScreensPerSite ?? cfg.maxScreensPerSite ?? 12;
  const maxSites = options.maxSites ?? cfg.maxSites ?? 25;
  const minHrefEdges = options.minHrefEdges ?? cfg.minHrefEdges ?? 1;
  const allow = options.hostAllowlist?.length
    ? new Set(options.hostAllowlist.map((h) => h.toLowerCase()))
    : null;

  const clusters = clusterCapturesByHost(rows, { maxScreensPerSite });
  const ranked = [...clusters.entries()]
    .filter(([host, list]) => list.length >= minScreens && (!allow || allow.has(host)))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, maxSites);

  const indexed: FlowDiscoverSiteResult[] = [];
  const skipped: FlowDiscoverSiteResult[] = [];

  for (const [host, list] of ranked) {
    const appScopeId = stableAppScopeFromRootUrl(`https://${host}/`);
    const screens: FlowScreenRef[] = [];
    for (const row of list) {
      const screen = await loadFlowScreenFromPackage(row.package_path);
      if (screen) screens.push(screen);
    }
    if (screens.length < minScreens) {
      skipped.push({
        host,
        app_scope_id: appScopeId,
        screen_count: screens.length,
        href_edge_count: 0,
        hotspot_count: 0,
        flow_id: null,
        flow_action_ids: [],
        skipped_reason: "insufficient_packages"
      });
      continue;
    }

    const edgesDoc = hrefJoinEdges({
      appScopeId,
      flowSessionId: null,
      screens
    });
    const hrefEdges = edgesDoc.edges.filter((edge) => edge.method === "href_join");
    const hotspotCount = hrefEdges.filter((edge) => Boolean(edge.hotspot)).length;

    if (hrefEdges.length < minHrefEdges) {
      skipped.push({
        host,
        app_scope_id: appScopeId,
        screen_count: screens.length,
        href_edge_count: hrefEdges.length,
        hotspot_count: hotspotCount,
        flow_id: null,
        flow_action_ids: [],
        skipped_reason: "no_href_joins"
      });
      continue;
    }

    const detectScreens = screens.map((screen, order) => ({
      order,
      url: screen.canonical_url,
      capture_run_id: screen.capture_run_id
    }));
    const flow_actions = detectFlowActionsL2(detectScreens);
    let graph = assembleFlowGraph({
      appScopeId,
      flowSessionId: null,
      screens: screens.map((screen) => ({
        capture_run_id: screen.capture_run_id,
        primary_url: screen.canonical_url
      })),
      edges: hrefEdges,
      flow_actions,
      title: `Discover ${host}`,
      notes: `source=href_discover; host=${host}; href_join=${hrefEdges.length}; hotspots=${hotspotCount}`
    });
    try {
      const { applyFlowActionsEnrichmentToGraph } = await import("./flow-actions-enrich.js");
      const enriched = await applyFlowActionsEnrichmentToGraph(graph, []);
      graph = enriched.graph;
    } catch {
      /* C2 optional */
    }

    let flowId: string | null = graph.flow_id;
    if (options.indexLibrary !== false) {
      await indexFlowGraph(graph);
    }

    indexed.push({
      host,
      app_scope_id: appScopeId,
      screen_count: screens.length,
      href_edge_count: hrefEdges.length,
      hotspot_count: hotspotCount,
      flow_id: flowId,
      flow_action_ids: graph.flow_actions.map((item) => item.taxonomy_id)
    });
  }

  return {
    sites_considered: ranked.length,
    indexed,
    skipped
  };
}

export async function runFlowDiscover(
  client: Queryable,
  options: {
    captureLimit?: number;
    minScreens?: number;
    maxScreensPerSite?: number;
    maxSites?: number;
    minHrefEdges?: number;
    indexLibrary?: boolean;
    hostAllowlist?: string[];
  } = {}
): Promise<{
  sites_considered: number;
  indexed: FlowDiscoverSiteResult[];
  skipped: FlowDiscoverSiteResult[];
  capture_rows: number;
}> {
  const rows = await listCapturesForFlowDiscover(client, options.captureLimit ?? 2000);
  const result = await discoverFlowsFromCaptures(rows, options);
  return { ...result, capture_rows: rows.length };
}
