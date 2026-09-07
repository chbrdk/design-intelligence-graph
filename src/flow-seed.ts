/**
 * DIG-011 CHECKION / manual URL seed worker (B2 bridge).
 * Spec: knowledge/flow-seed-bridges.md · docs/DIG-011-phase-b-measure.md
 *
 * DIG never spiders — consumes ordered URL seeds and emits seed_sequence edges
 * once CaptureRuns exist for those URLs.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  checkionConfig,
  getCheckionDomainOverview,
  type CheckionConfig,
  type CheckionDomainOverview
} from "./checkion-client.js";
import { normalizeFlowJoinUrl, seedSequenceEdges, hrefJoinEdges, mergeFlowEdgeDocuments, loadFlowScreenFromPackage, type FlowEdgesDocument, type FlowScreenRef } from "./flow-edges.js";
import { indexesDirectory, loadDigPaths } from "./runtime-paths.js";

export const FLOW_SEED_SOURCE_CHECKION = "checkion_domain_scan";
export const FLOW_SEED_SOURCE_MANUAL = "manual";
export const FLOW_SEED_SOURCE_FIXTURE = "fixture";
export const FLOW_SEED_SOURCE_AUDION = "audion_journey";

export type FlowSeedSource =
  | typeof FLOW_SEED_SOURCE_CHECKION
  | typeof FLOW_SEED_SOURCE_MANUAL
  | typeof FLOW_SEED_SOURCE_FIXTURE
  | typeof FLOW_SEED_SOURCE_AUDION;

export interface FlowSeedUrl {
  url: string;
  checkion_scan_id?: string | null;
  score?: number | null;
}

export interface FlowSeedSession {
  schema_version: "0.1.0";
  seed_source: FlowSeedSource;
  seed_ref: string | null;
  app_scope_id: string;
  flow_session_id: string;
  urls: FlowSeedUrl[];
  root_url?: string | null;
  created_at: string;
}

export interface FlowSeedCaptureRef {
  url: string;
  capture_run_id: string;
  screen_id?: string;
  checkion_scan_id?: string | null;
  package_path?: string | null;
}

/** Prefer overview.pageSamples; always include root URL when present. */
export function extractUrlsFromDomainOverview(
  overview: CheckionDomainOverview,
  options: { maxUrls?: number } = {}
): FlowSeedUrl[] {
  const maxUrls = options.maxUrls && options.maxUrls > 0 ? options.maxUrls : 24;
  const seen = new Set<string>();
  const out: FlowSeedUrl[] = [];

  const push = (raw: string, score: number | null = null) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = normalizeFlowJoinUrl(trimmed) ?? trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url: trimmed, score });
  };

  const root = overview.scan?.rootUrl;
  if (typeof root === "string") push(root, overview.scan.overallScore ?? null);

  for (const sample of overview.pageSamples ?? []) {
    if (typeof sample?.url === "string") push(sample.url, sample.score ?? null);
    if (out.length >= maxUrls) break;
  }

  return out.slice(0, maxUrls);
}

export function buildFlowSeedSession(input: {
  seedSource: FlowSeedSource;
  seedRef?: string | null;
  appScopeId: string;
  flowSessionId?: string;
  urls: Array<string | FlowSeedUrl>;
  rootUrl?: string | null;
  now?: () => Date;
}): FlowSeedSession {
  const now = input.now ?? (() => new Date());
  const urls: FlowSeedUrl[] = input.urls.map((item) =>
    typeof item === "string" ? { url: item } : { ...item, url: item.url }
  );
  return {
    schema_version: "0.1.0",
    seed_source: input.seedSource,
    seed_ref: input.seedRef ?? null,
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? `fsess_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    urls,
    root_url: input.rootUrl ?? null,
    created_at: now().toISOString()
  };
}

export async function fetchCheckionDomainSeedSession(
  input: {
    domainScanId: string;
    appScopeId: string;
    flowSessionId?: string;
    maxUrls?: number;
    /** Inject overview in tests — skips live CHECKION HTTP. */
    overview?: CheckionDomainOverview;
  },
  config: CheckionConfig = checkionConfig()
): Promise<{ session: FlowSeedSession; overview: CheckionDomainOverview }> {
  const overview =
    input.overview ?? (await getCheckionDomainOverview(input.domainScanId, config));
  const urls = extractUrlsFromDomainOverview(
    overview,
    input.maxUrls !== undefined ? { maxUrls: input.maxUrls } : {}
  );
  if (!urls.length) {
    throw new Error(`CHECKION domain scan ${input.domainScanId} returned no page URLs`);
  }
  const session = buildFlowSeedSession({
    seedSource: FLOW_SEED_SOURCE_CHECKION,
    seedRef: input.domainScanId,
    appScopeId: input.appScopeId,
    urls,
    rootUrl: overview.scan?.rootUrl ?? null,
    ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {})
  });
  return { session, overview };
}

/** Match seed URLs to existing CaptureRuns via normalized join keys. */
export function matchSeedUrlsToCaptures(
  session: FlowSeedSession,
  captures: Array<{
    capture_run_id: string;
    canonical_url: string;
    screen_id?: string;
    package_path?: string | null;
  }>
): FlowSeedCaptureRef[] {
  const byKey = new Map<
    string,
    { capture_run_id: string; screen_id?: string; canonical_url: string; package_path?: string | null }
  >();
  for (const capture of captures) {
    const key = normalizeFlowJoinUrl(capture.canonical_url);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, capture);
  }
  const matched: FlowSeedCaptureRef[] = [];
  for (const entry of session.urls) {
    const key = normalizeFlowJoinUrl(entry.url);
    if (!key) continue;
    const hit = byKey.get(key);
    if (!hit) continue;
    matched.push({
      url: entry.url,
      capture_run_id: hit.capture_run_id,
      ...(hit.screen_id ? { screen_id: hit.screen_id } : {}),
      checkion_scan_id: entry.checkion_scan_id ?? null,
      ...(hit.package_path ? { package_path: hit.package_path } : {})
    });
  }
  return matched;
}

export function edgesFromSeedSession(
  session: FlowSeedSession,
  matched: FlowSeedCaptureRef[],
  screens?: FlowScreenRef[]
): FlowEdgesDocument {
  return seedSequenceEdges({
    appScopeId: session.app_scope_id,
    flowSessionId: session.flow_session_id,
    seedSource: session.seed_source,
    steps: matched.map((step) => ({
      url: step.url,
      capture_run_id: step.capture_run_id,
      ...(step.screen_id ? { screen_id: step.screen_id } : {})
    })),
    ...(session.seed_ref ? { seedRef: session.seed_ref } : {}),
    ...(screens?.length ? { screens } : {})
  });
}

export async function persistFlowSeedSession(session: FlowSeedSession): Promise<string> {
  const paths = loadDigPaths() as {
    flowSeed?: { sessionsRelativeDir?: string };
  };
  const relative = paths.flowSeed?.sessionsRelativeDir ?? "flow-seeds";
  const dir = resolve(indexesDirectory(), relative);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${session.flow_session_id}.json`);
  await writeFile(filePath, JSON.stringify(session, null, 2));
  return filePath;
}

export type EnqueueCaptureFn = (url: string) => Promise<{ job_id: string } | void> | { job_id: string } | void;

let enqueueCaptureHook: EnqueueCaptureFn | null = null;

/** Wire JobRunner from web-server so POST /flows/seed can enqueue captures. */
export function setFlowSeedEnqueueCapture(fn: EnqueueCaptureFn | null): void {
  enqueueCaptureHook = fn;
}

export function getFlowSeedEnqueueCapture(): EnqueueCaptureFn | null {
  return enqueueCaptureHook;
}

export type FlowSeedPassResult = {
  session: FlowSeedSession;
  session_path: string | null;
  matched: FlowSeedCaptureRef[];
  edges: FlowEdgesDocument | null;
  enqueued_jobs: string[];
  missing_urls: string[];
  flow_id: string | null;
  flow_graph_path: string | null;
  flow_action_ids: string[];
};

async function finalizeFlowSeedSession(input: {
  session: FlowSeedSession;
  persist?: boolean;
  captures?: Array<{
    capture_run_id: string;
    canonical_url: string;
    screen_id?: string;
    package_path?: string | null;
  }>;
  enqueueCapture?: EnqueueCaptureFn;
  /** When true (default), assemble C1 + index Library graph if ≥2 matched screens. */
  indexLibrary?: boolean;
}): Promise<FlowSeedPassResult> {
  const sessionPath = input.persist === false ? null : await persistFlowSeedSession(input.session);
  const matched = matchSeedUrlsToCaptures(input.session, input.captures ?? []);
  const matchedKeys = new Set(matched.map((item) => normalizeFlowJoinUrl(item.url) ?? item.url));
  const missing = input.session.urls.filter((item) => {
    const key = normalizeFlowJoinUrl(item.url) ?? item.url;
    return !matchedKeys.has(key);
  });

  const enqueued: string[] = [];
  const enqueue = input.enqueueCapture ?? getFlowSeedEnqueueCapture();
  if (enqueue) {
    for (const item of missing) {
      const result = await enqueue(item.url);
      if (result && typeof result === "object" && "job_id" in result && result.job_id) {
        enqueued.push(String(result.job_id));
      }
    }
  }

  const packageScreens: FlowScreenRef[] = [];
  for (const step of matched) {
    const pkg = step.package_path?.trim();
    if (!pkg) continue;
    const screen = await loadFlowScreenFromPackage(pkg);
    if (screen) packageScreens.push(screen);
  }

  const seedEdges =
    matched.length >= 2 ? edgesFromSeedSession(input.session, matched, packageScreens) : null;
  const hrefEdges =
    packageScreens.length >= 2
      ? hrefJoinEdges({
          appScopeId: input.session.app_scope_id,
          flowSessionId: input.session.flow_session_id,
          screens: packageScreens
        })
      : null;
  const edges =
    seedEdges && hrefEdges
      ? mergeFlowEdgeDocuments(seedEdges, hrefEdges)
      : seedEdges ?? hrefEdges;

  let flow_id: string | null = null;
  let flow_graph_path: string | null = null;
  let flow_action_ids: string[] = [];

  if (edges && matched.length >= 2 && input.indexLibrary !== false) {
    const { detectFlowActionsL2 } = await import("./flow-detect.js");
    const { assembleFlowGraph, stableScopedFlowId } = await import("./flow-assemble.js");
    const { indexFlowGraph } = await import("./flow-library.js");
    const detectScreens = matched.map((step, order) => ({
      order,
      url: step.url,
      capture_run_id: step.capture_run_id
    }));
    const flow_actions = detectFlowActionsL2(detectScreens);
    const hrefCount = edges.edges.filter((edge) => edge.method === "href_join").length;
    const hotspotCount = edges.edges.filter((edge) => Boolean(edge.hotspot)).length;
    let graph = assembleFlowGraph({
      flowId: stableScopedFlowId(input.session.app_scope_id, `seed:${input.session.seed_source}`),
      appScopeId: input.session.app_scope_id,
      flowSessionId: input.session.flow_session_id,
      screens: matched.map((step, order) => ({
        capture_run_id: step.capture_run_id,
        primary_url: step.url,
        order,
        checkion_scan_id: step.checkion_scan_id ?? null
      })),
      edges: edges.edges,
      flow_actions,
      title: `Seed ${input.session.app_scope_id}`,
      notes: `seed_source=${input.session.seed_source}; href_join=${hrefCount}; hotspots=${hotspotCount}`
    });
    try {
      const { applyFlowActionsEnrichmentToGraph } = await import("./flow-actions-enrich.js");
      const enriched = await applyFlowActionsEnrichmentToGraph(graph, []);
      graph = enriched.graph;
    } catch {
      /* C2 optional */
    }
    flow_id = graph.flow_id;
    flow_graph_path = await indexFlowGraph(graph);
    flow_action_ids = graph.flow_actions.map((item) => item.taxonomy_id);
  }

  return {
    session: input.session,
    session_path: sessionPath,
    matched,
    edges,
    enqueued_jobs: enqueued,
    missing_urls: missing.map((item) => item.url),
    flow_id,
    flow_graph_path,
    flow_action_ids
  };
}

/**
 * Manual / fixture / AUDION URL seed → optional capture enqueue → B2 edges + Library index.
 */
export async function runManualFlowSeed(input: {
  appScopeId: string;
  urls: Array<string | FlowSeedUrl>;
  seedSource?:
    | typeof FLOW_SEED_SOURCE_MANUAL
    | typeof FLOW_SEED_SOURCE_FIXTURE
    | typeof FLOW_SEED_SOURCE_AUDION;
  seedRef?: string | null;
  flowSessionId?: string;
  maxUrls?: number;
  persist?: boolean;
  captures?: Array<{
    capture_run_id: string;
    canonical_url: string;
    screen_id?: string;
    package_path?: string | null;
  }>;
  enqueueCapture?: EnqueueCaptureFn;
  indexLibrary?: boolean;
}): Promise<FlowSeedPassResult> {
  const seedSource = input.seedSource ?? FLOW_SEED_SOURCE_MANUAL;
  const maxUrls = input.maxUrls && input.maxUrls > 0 ? input.maxUrls : 24;
  const capped = input.urls.slice(0, maxUrls);
  if (!capped.length) throw new Error("manual_flow_seed_urls_required");
  const session = buildFlowSeedSession({
    seedSource,
    seedRef: input.seedRef ?? null,
    appScopeId: input.appScopeId,
    ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {}),
    urls: capped,
    rootUrl: typeof capped[0] === "string" ? capped[0] : capped[0]!.url
  });
  return finalizeFlowSeedSession({
    session,
    ...(input.persist !== undefined ? { persist: input.persist } : {}),
    ...(input.captures !== undefined ? { captures: input.captures } : {}),
    ...(input.enqueueCapture !== undefined ? { enqueueCapture: input.enqueueCapture } : {}),
    ...(input.indexLibrary !== undefined ? { indexLibrary: input.indexLibrary } : {})
  });
}

/**
 * Full CHECKION seed pass: fetch overview → session → optional capture enqueue → edges when captures match.
 */
export async function runCheckionDomainSeed(input: {
  domainScanId: string;
  appScopeId: string;
  flowSessionId?: string;
  maxUrls?: number;
  persist?: boolean;
  captures?: Array<{
    capture_run_id: string;
    canonical_url: string;
    screen_id?: string;
    package_path?: string | null;
  }>;
  enqueueCapture?: EnqueueCaptureFn;
  config?: CheckionConfig;
  overview?: CheckionDomainOverview;
  indexLibrary?: boolean;
}): Promise<FlowSeedPassResult> {
  const { session } = await fetchCheckionDomainSeedSession(
    {
      domainScanId: input.domainScanId,
      appScopeId: input.appScopeId,
      ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {}),
      ...(input.maxUrls !== undefined ? { maxUrls: input.maxUrls } : {}),
      ...(input.overview !== undefined ? { overview: input.overview } : {})
    },
    input.config ?? checkionConfig()
  );

  return finalizeFlowSeedSession({
    session,
    ...(input.persist !== undefined ? { persist: input.persist } : {}),
    ...(input.captures !== undefined ? { captures: input.captures } : {}),
    ...(input.enqueueCapture !== undefined ? { enqueueCapture: input.enqueueCapture } : {}),
    ...(input.indexLibrary !== undefined ? { indexLibrary: input.indexLibrary } : {})
  });
}

export function stableAppScopeFromRootUrl(rootUrl: string): string {
  const key = normalizeFlowJoinUrl(rootUrl) ?? rootUrl.toLowerCase();
  return `app_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}
