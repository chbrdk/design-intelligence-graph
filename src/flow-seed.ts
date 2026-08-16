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
import { normalizeFlowJoinUrl, seedSequenceEdges, type FlowEdgesDocument } from "./flow-edges.js";
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
  captures: Array<{ capture_run_id: string; canonical_url: string; screen_id?: string }>
): FlowSeedCaptureRef[] {
  const byKey = new Map<string, { capture_run_id: string; screen_id?: string; canonical_url: string }>();
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
      checkion_scan_id: entry.checkion_scan_id ?? null
    });
  }
  return matched;
}

export function edgesFromSeedSession(
  session: FlowSeedSession,
  matched: FlowSeedCaptureRef[]
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
    ...(session.seed_ref ? { seedRef: session.seed_ref } : {})
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

/**
 * Full CHECKION seed pass: fetch overview → session → optional capture enqueue → edges when captures match.
 */
export async function runCheckionDomainSeed(input: {
  domainScanId: string;
  appScopeId: string;
  flowSessionId?: string;
  maxUrls?: number;
  persist?: boolean;
  captures?: Array<{ capture_run_id: string; canonical_url: string; screen_id?: string }>;
  enqueueCapture?: EnqueueCaptureFn;
  config?: CheckionConfig;
  overview?: CheckionDomainOverview;
}): Promise<{
  session: FlowSeedSession;
  session_path: string | null;
  matched: FlowSeedCaptureRef[];
  edges: FlowEdgesDocument | null;
  enqueued_jobs: string[];
  missing_urls: string[];
}> {
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

  const sessionPath = input.persist === false ? null : await persistFlowSeedSession(session);
  const matched = matchSeedUrlsToCaptures(session, input.captures ?? []);
  const matchedKeys = new Set(matched.map((item) => normalizeFlowJoinUrl(item.url) ?? item.url));
  const missing = session.urls.filter((item) => {
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

  const edges =
    matched.length >= 2
      ? edgesFromSeedSession(session, matched)
      : null;

  return {
    session,
    session_path: sessionPath,
    matched,
    edges,
    enqueued_jobs: enqueued,
    missing_urls: missing.map((item) => item.url)
  };
}

export function stableAppScopeFromRootUrl(rootUrl: string): string {
  const key = normalizeFlowJoinUrl(rootUrl) ?? rootUrl.toLowerCase();
  return `app_${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}
