/**
 * Grow same-site flow coverage by enqueueing missing same-origin destinations
 * found in Phase A flow-candidates — no fixed industry journeys.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureIdentityKey, filterExistingCaptureUrls } from "./capture-identity.js";
import type { Queryable } from "./db.js";
import type { FlowCandidate, FlowCandidatesDocument } from "./flow-candidates.js";
import { normalizeFlowJoinUrl } from "./flow-edges.js";
import { listCapturesForFlowDiscover, type FlowDiscoverCaptureRow } from "./flow-discover.js";
import { getFlowSeedEnqueueCapture } from "./flow-seed.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { CaptureManifest } from "./types.js";

const BAD_FOLLOW_HOST =
  /(^|\.)(apps\.apple\.com|itunes\.apple\.com|play\.google\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|login\.microsoftonline\.com)$/i;
const BAD_FOLLOW_PATH =
  /\/(legal|privacy(?:-policy)?|cookie(?:s|-policy)?|impressum|terms|agb|datenschutz|consent|gdpr|newsletter|unsubscribe|cart|checkout|account|my-account|password|login|signin|sign-in|signup|sign-up|signups|publishing-information|imprint)(\/|$|\?|-)/i;

/** Drop storefronts, legal, auth, and redacted tracking URLs from follow enqueue. */
export function isLowValueFollowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (BAD_FOLLOW_HOST.test(host)) return true;
    if (BAD_FOLLOW_PATH.test(parsed.pathname || "/")) return true;
    if (/%5bredacted%5d/i.test(url) || /\[redacted\]/i.test(url)) return true;
    if ((parsed.search || "").length > 80) return true;
    return false;
  } catch {
    return true;
  }
}

export type FlowFollowSuggestion = {
  url: string;
  from_capture_run_id: string;
  from_url: string;
  host: string;
  candidacy_score: number;
  candidate_id: string;
};

function candidateHref(candidate: FlowCandidate): string | null {
  const hrefEv = candidate.evidence.find((item) => item.kind === "attribute" && item.fact === "href");
  if (typeof hrefEv?.value === "string" && hrefEv.value.trim()) return hrefEv.value.trim();
  return candidate.destination;
}

export function resolveSameOriginFollowUrl(
  pageUrl: string,
  candidate: FlowCandidate
): string | null {
  if (candidate.safety === "forbid") return null;
  if (
    candidate.destination_class === "external" ||
    candidate.destination_class === "fragment" ||
    candidate.destination_class === "action_unsafe" ||
    candidate.destination_class === "unknown"
  ) {
    return null;
  }
  const destRaw = candidate.destination || candidateHref(candidate);
  if (!destRaw) return null;
  try {
    const resolved = new URL(destRaw, pageUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    const page = new URL(pageUrl);
    if (resolved.origin !== page.origin) return null;
    resolved.hash = "";
    // Prefer clean path URLs for capture.
    return resolved.toString();
  } catch {
    return null;
  }
}

export async function collectFlowFollowSuggestions(
  rows: FlowDiscoverCaptureRow[],
  options: { maxPerHost?: number; minScore?: number } = {}
): Promise<FlowFollowSuggestion[]> {
  const paths = loadDigPaths() as {
    flowFollow?: { maxPerHost?: number; minScore?: number };
  };
  const maxPerHost = Math.max(1, Math.min(20, options.maxPerHost ?? paths.flowFollow?.maxPerHost ?? 4));
  const minScore = options.minScore ?? paths.flowFollow?.minScore ?? 0.35;

  const existingKeys = new Set<string>();
  for (const row of rows) {
    const key = captureIdentityKey(row.canonical_url);
    if (key) existingKeys.add(key);
  }

  const byHostCount = new Map<string, number>();
  const suggestions: FlowFollowSuggestion[] = [];
  const seenSuggest = new Set<string>();

  for (const row of rows) {
    let manifestUrl = row.canonical_url;
    let candidates: FlowCandidate[] = [];
    try {
      const manifest = JSON.parse(
        await readFile(resolve(row.package_path, "manifest.json"), "utf8")
      ) as CaptureManifest;
      if (manifest.canonical_url) manifestUrl = manifest.canonical_url;
      const candDoc = JSON.parse(
        await readFile(resolve(row.package_path, "derived/flow-candidates.json"), "utf8")
      ) as FlowCandidatesDocument;
      candidates = candDoc.candidates ?? [];
    } catch {
      continue;
    }

    const ranked = [...candidates]
      .filter((item) => item.candidacy_score >= minScore)
      .sort((a, b) => b.candidacy_score - a.candidacy_score || a.candidate_id.localeCompare(b.candidate_id));

    for (const candidate of ranked) {
      const url = resolveSameOriginFollowUrl(manifestUrl, candidate);
      if (!url) continue;
      if (isLowValueFollowUrl(url)) continue;
      const join = normalizeFlowJoinUrl(url);
      if (!join) continue;
      const key = captureIdentityKey(url);
      if (!key || existingKeys.has(key) || seenSuggest.has(key)) continue;
      let host: string;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        continue;
      }
      const used = byHostCount.get(host) ?? 0;
      if (used >= maxPerHost) continue;
      byHostCount.set(host, used + 1);
      seenSuggest.add(key);
      existingKeys.add(key);
      suggestions.push({
        url,
        from_capture_run_id: row.capture_run_id,
        from_url: manifestUrl,
        host,
        candidacy_score: candidate.candidacy_score,
        candidate_id: candidate.candidate_id
      });
    }
  }

  suggestions.sort(
    (a, b) => b.candidacy_score - a.candidacy_score || a.url.localeCompare(b.url)
  );
  return suggestions;
}

export async function runFlowFollow(
  client: Queryable,
  options: {
    captureLimit?: number;
    maxEnqueue?: number;
    maxPerHost?: number;
    minScore?: number;
    enqueue?: boolean;
    existingUrlKeys?: Set<string>;
  } = {}
): Promise<{
  capture_rows: number;
  suggested: FlowFollowSuggestion[];
  enqueued_jobs: string[];
  skipped_existing: number;
}> {
  const paths = loadDigPaths() as { flowFollow?: { maxEnqueue?: number } };
  const maxEnqueue = Math.max(
    1,
    Math.min(200, options.maxEnqueue ?? paths.flowFollow?.maxEnqueue ?? 40)
  );
  const rows = await listCapturesForFlowDiscover(client, options.captureLimit ?? 1500);
  const all = await collectFlowFollowSuggestions(rows, {
    ...(options.maxPerHost !== undefined ? { maxPerHost: options.maxPerHost } : {}),
    ...(options.minScore !== undefined ? { minScore: options.minScore } : {})
  });

  const existing = options.existingUrlKeys ?? new Set<string>();
  const filtered = filterExistingCaptureUrls(
    all.map((item) => item.url),
    existing
  );
  const cappedUrls = filtered.urls.slice(0, maxEnqueue);
  const urlSet = new Set(cappedUrls);
  const suggested = all.filter((item) => urlSet.has(item.url)).slice(0, maxEnqueue);

  const enqueued_jobs: string[] = [];
  if (options.enqueue !== false) {
    const enqueue = getFlowSeedEnqueueCapture();
    if (enqueue) {
      for (const item of suggested) {
        const result = await enqueue(item.url);
        if (result && typeof result === "object" && result.job_id) {
          enqueued_jobs.push(String(result.job_id));
        }
      }
    }
  }

  return {
    capture_rows: rows.length,
    suggested,
    enqueued_jobs,
    skipped_existing: filtered.skippedExisting + (all.length - suggested.length)
  };
}
