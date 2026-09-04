/**
 * Library screen search: retrieval-first dense/screenshot, then facet hydrate.
 * Facet-only browse still uses newest-first listLibraryScreens.
 * @see knowledge/dense-embeddings.md
 * @see knowledge/screenshot-embeddings.md
 */
import type { Queryable } from "./db.js";
import { denseEmbeddingsEnabled, searchDenseEmbeddings } from "./dense-embeddings.js";
import {
  listLibraryScreens,
  listLibraryScreensByCaptureIds,
  type LibraryScreenListOpts,
  type LibraryScreenRecord
} from "./library-screens.js";
import { screenshotEmbeddingsEnabled, searchScreenshotEmbeddings } from "./screenshot-embeddings.js";
import { loadDigPaths } from "./runtime-paths.js";
import {
  isExcludedDomain,
  mmrSelectNeighbors,
  normalizeDomain,
  similarityGraphConfig
} from "./similarity-graph.js";

export type ScreenSearchProvider = "dense" | "hashing" | "screenshot";

export type LibraryScreenSearchHit = LibraryScreenRecord & {
  score?: number;
};

export type LibraryScreenSearchConfig = {
  candidatePool: number;
  candidatePoolCap: number;
  mmrLambda: number;
  diversify: boolean;
};

/** Corpus search pool + MMR diversification for inspiration results. */
export function libraryScreenSearchConfig(root = process.cwd()): LibraryScreenSearchConfig {
  const cfg = loadDigPaths(root).libraryScreenSearch;
  const graph = similarityGraphConfig(root);
  const pool = Number(cfg?.candidatePool);
  const cap = Number(cfg?.candidatePoolCap);
  const lambda = Number(cfg?.mmrLambda);
  return {
    candidatePool: Number.isFinite(pool) && pool > 0 ? Math.round(pool) : 128,
    candidatePoolCap: Number.isFinite(cap) && cap > 0 ? Math.round(cap) : 200,
    mmrLambda: Number.isFinite(lambda) ? Math.min(1, Math.max(0, lambda)) : graph.mmrLambda,
    diversify: cfg?.diversify !== false
  };
}

/**
 * Maximal Marginal Relevance over scored library screens.
 * Punishes same-domain and same-style repeats so Top-k is not one sticky hub.
 */
export function diversifyLibraryScreens<T extends LibraryScreenSearchHit>(
  screens: T[],
  limit: number,
  options: { mmrLambda?: number } = {}
): T[] {
  if (limit <= 0 || !screens.length) return [];
  if (screens.length <= limit) return screens;
  const lambda =
    typeof options.mmrLambda === "number" && Number.isFinite(options.mmrLambda)
      ? Math.min(1, Math.max(0, options.mmrLambda))
      : 0.7;
  const byId = new Map(screens.map((row) => [row.capture_run_id, row]));
  const candidates = screens.map((row) => ({
    id: row.capture_run_id,
    cosine: typeof row.score === "number" ? row.score : 0,
    score: typeof row.score === "number" ? row.score : 0,
    domain: normalizeDomain(row.site_domain),
    style: row.design_facets?.style ?? null
  }));
  const picked = mmrSelectNeighbors(candidates, limit, lambda);
  const out: T[] = [];
  for (const hit of picked) {
    const row = byId.get(hit.id);
    if (row) out.push(row);
  }
  return out;
}

export function resolveScreenSearchProvider(
  raw: string | null | undefined,
  query: string | null | undefined
): ScreenSearchProvider {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "dense" || value === "hashing" || value === "screenshot") return value;
  return query?.trim() ? "dense" : "hashing";
}

export function usesSemanticScreenQuery(provider: ScreenSearchProvider): boolean {
  return provider === "dense" || provider === "screenshot";
}

function sortScreensByScore<T extends { capture_run_id: string }>(
  screens: T[],
  score: Map<string, number>
): T[] {
  if (!score.size) return screens;
  return [...screens].sort((a, b) => {
    const sa = score.get(a.capture_run_id);
    const sb = score.get(b.capture_run_id);
    if (sa === undefined && sb === undefined) return 0;
    if (sa === undefined) return 1;
    if (sb === undefined) return -1;
    return sb - sa;
  });
}

function scoreMapFromHits(hits: Array<Record<string, unknown>>): Map<string, number> {
  const score = new Map<string, number>();
  for (const hit of hits) {
    const id = String(hit.capture_run_id ?? "");
    const value = Number(hit.score ?? 0);
    if (!id) continue;
    const current = score.get(id);
    if (current === undefined || value > current) score.set(id, value);
  }
  return score;
}

/** Ordered unique capture ids from vector hits, dropping junk hosts. */
export function captureIdsFromVectorHits(
  hits: Array<Record<string, unknown>>,
  excludeDomains: string[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const id = String(hit.capture_run_id ?? "");
    if (!id || seen.has(id)) continue;
    const domain = typeof hit.site_domain === "string" ? hit.site_domain : null;
    if (isExcludedDomain(domain, excludeDomains)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function rankScreensByDense<T extends { capture_run_id: string }>(
  client: Queryable,
  screens: T[],
  query: string,
  options: { limit?: number; root?: string } = {}
): Promise<T[]> {
  if (!screens.length || !query.trim() || !denseEmbeddingsEnabled(process.env, options.root)) {
    return screens;
  }
  const ids = [...new Set(screens.map((row) => row.capture_run_id).filter(Boolean))];
  if (!ids.length) return screens;
  try {
    const hits = await searchDenseEmbeddings(client, query.trim(), Math.max(ids.length, 20), {
      subject_kind: "screen",
      capture_run_ids: ids,
      ...(options.root ? { root: options.root } : {})
    });
    return sortScreensByScore(screens, scoreMapFromHits(hits));
  } catch {
    return screens;
  }
}

export async function rankScreensByScreenshot<T extends { capture_run_id: string }>(
  client: Queryable,
  screens: T[],
  query: string,
  options: { root?: string } = {}
): Promise<T[]> {
  if (!screens.length || !query.trim() || !screenshotEmbeddingsEnabled(process.env, options.root)) {
    return screens;
  }
  const ids = [...new Set(screens.map((row) => row.capture_run_id).filter(Boolean))];
  if (!ids.length) return screens;
  try {
    const hits = await searchScreenshotEmbeddings(client, query.trim(), Math.max(ids.length, 20), {
      capture_run_ids: ids,
      ...(options.root ? { root: options.root } : {})
    });
    return sortScreensByScore(screens, scoreMapFromHits(hits));
  } catch {
    return screens;
  }
}

export async function rankLibraryScreens<T extends { capture_run_id: string }>(
  client: Queryable,
  screens: T[],
  query: string | null | undefined,
  provider: ScreenSearchProvider,
  options: { root?: string } = {}
): Promise<T[]> {
  const q = query?.trim() ?? "";
  if (!q) return screens;
  if (provider === "dense") return rankScreensByDense(client, screens, q, options);
  if (provider === "screenshot") return rankScreensByScreenshot(client, screens, q, options);
  return screens;
}

export type SearchLibraryScreensOpts = LibraryScreenListOpts & {
  provider?: ScreenSearchProvider | null | undefined;
  /** Final result count (default 40, max 100). */
  limit?: number | undefined;
  /** Dense candidate pool before facet filter (default max(limit*4, 48)). */
  candidatePool?: number | undefined;
  root?: string;
};

/**
 * Retrieval-first when `q` + dense/screenshot: vector search over the full corpus,
 * then hydrate desktop screens and apply craft facet filters.
 * Without `q`: newest-first browse via listLibraryScreens.
 */
export async function searchLibraryScreens(
  client: Queryable,
  opts: SearchLibraryScreensOpts = {}
): Promise<{ screens: LibraryScreenSearchHit[]; provider: ScreenSearchProvider; retrieval: "corpus" | "window" }> {
  const root = opts.root ?? process.cwd();
  const q = typeof opts.q === "string" ? opts.q.trim() : "";
  const provider = resolveScreenSearchProvider(opts.provider, q || null);
  const limit =
    typeof opts.limit === "number" && Number.isFinite(opts.limit)
      ? Math.max(1, Math.min(100, Math.floor(opts.limit)))
      : 40;
  const facetOpts: LibraryScreenListOpts = {
    style: opts.style,
    layout: opts.layout,
    industry: opts.industry,
    modules: opts.modules,
    craft_tags: opts.craft_tags,
    imagery_density: opts.imagery_density,
    type_scale: opts.type_scale,
    type_image_mode: opts.type_image_mode,
    contrast_mode: opts.contrast_mode,
    composition_energy: opts.composition_energy,
    chrome_weight: opts.chrome_weight,
    platformProjectId: opts.platformProjectId
  };

  if (q && usesSemanticScreenQuery(provider)) {
    const searchCfg = libraryScreenSearchConfig(root);
    const poolRaw =
      typeof opts.candidatePool === "number" && Number.isFinite(opts.candidatePool)
        ? Math.floor(opts.candidatePool)
        : Math.max(limit * 8, searchCfg.candidatePool);
    const pool = Math.max(limit, Math.min(searchCfg.candidatePoolCap, poolRaw));
    const excludeDomains = similarityGraphConfig(root).excludeDomains;

    try {
      const enabled =
        provider === "screenshot"
          ? screenshotEmbeddingsEnabled(process.env, root)
          : denseEmbeddingsEnabled(process.env, root);
      if (enabled) {
        const hits =
          provider === "screenshot"
            ? await searchScreenshotEmbeddings(client, q, pool, { root })
            : await searchDenseEmbeddings(client, q, pool, { subject_kind: "screen", root });
        const scores = scoreMapFromHits(hits);
        const orderedIds = captureIdsFromVectorHits(hits, excludeDomains);
        if (orderedIds.length) {
          const hydrated = await listLibraryScreensByCaptureIds(client, orderedIds, facetOpts);
          const byId = new Map(hydrated.map((row) => [row.capture_run_id, row]));
          const ordered: LibraryScreenSearchHit[] = [];
          for (const id of orderedIds) {
            const row = byId.get(id);
            if (!row) continue;
            const score = scores.get(id);
            ordered.push(score === undefined ? row : { ...row, score });
          }
          const screens = searchCfg.diversify
            ? diversifyLibraryScreens(ordered, limit, { mmrLambda: searchCfg.mmrLambda })
            : ordered.slice(0, limit);
          return { screens, provider, retrieval: "corpus" };
        }
      }
    } catch {
      // fall through to window browse + re-rank
    }
  }

  const listed = await listLibraryScreens(client, {
    ...facetOpts,
    ...(q && !usesSemanticScreenQuery(provider) ? { q } : {}),
    limit: 200
  });
  const ranked = await rankLibraryScreens(client, listed, q || null, provider, { root });
  // Deduplicate viewports to one row per capture (prefer already-listed order)
  const seen = new Set<string>();
  const screens: LibraryScreenSearchHit[] = [];
  for (const row of ranked) {
    if (seen.has(row.capture_run_id)) continue;
    seen.add(row.capture_run_id);
    screens.push(row);
    if (screens.length >= limit) break;
  }
  return { screens, provider, retrieval: "window" };
}
