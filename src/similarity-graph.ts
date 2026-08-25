/**
 * Similarity graph over dense (craft text) or screenshot (visual) embeddings.
 * Full corpus (up to nodeCap) with kNN edges; in-process TTL cache for repeat hits.
 * Hub mitigations: junk-domain filter, facet-first re-rank, MMR diversity.
 * @see knowledge/similarity-graph.md
 */
import type { Queryable } from "./db.js";
import { denseEmbeddingConfig } from "./dense-embeddings.js";
import { screenshotEmbeddingConfig } from "./screenshot-embeddings.js";
import { loadScreenFacetsByCaptureIds } from "./library-screens.js";
import type { ScreenFacetSummary } from "./design-facets.js";
import { loadDigPaths } from "./runtime-paths.js";

export type SimilarityGraphKind = "craft" | "visual";

export type SimilarityGraphNode = {
  capture_run_id: string;
  site_domain: string | null;
  canonical_url: string | null;
  viewport_capture_id: string | null;
  title: string | null;
  design_facets?: ScreenFacetSummary | null;
};

export type SimilarityGraphEdge = {
  from_id: string;
  to_id: string;
  score: number;
};

export type SimilarityGraph = {
  kind: SimilarityGraphKind;
  model: string;
  threshold: number;
  total: number;
  page_size: number;
  neighbor_k: number;
  cached?: boolean;
  nodes: SimilarityGraphNode[];
  edges: SimilarityGraphEdge[];
};

export type LoadSimilarityGraphOptions = {
  /** Cap nodes (newest first). Omit for full nodeCap. */
  limit?: number;
  /** Bypass in-process cache. */
  refresh?: boolean;
};

type CacheEntry = { at: number; graph: SimilarityGraph };

const graphCache = new Map<string, CacheEntry>();

const DEFAULT_EXCLUDE_DOMAINS = [
  "chromewebdata",
  "spirion.projects-a.plygrnd.tech",
  "forsale.godaddy.com"
];

export function similarityGraphConfig(root = process.cwd()): {
  nodeCap: number;
  edgeCap: number;
  threshold: number;
  pageSize: number;
  neighborK: number;
  cacheTtlMs: number;
  excludeDomains: string[];
  candidatePool: number;
  facetWeight: number;
  mmrLambda: number;
} {
  const cfg = loadDigPaths(root).similarityGraph;
  const nodeCap = cfg?.nodeCap ?? 5000;
  const neighborK = cfg?.neighborK ?? 8;
  const cacheTtlSec = cfg?.cacheTtlSec ?? 600;
  const exclude = Array.isArray(cfg?.excludeDomains) ? cfg.excludeDomains : DEFAULT_EXCLUDE_DOMAINS;
  const candidatePool = Number(cfg?.candidatePool);
  const facetWeight = Number(cfg?.facetWeight);
  const mmrLambda = Number(cfg?.mmrLambda);
  return {
    nodeCap,
    edgeCap: cfg?.edgeCap ?? nodeCap * neighborK,
    threshold: cfg?.threshold ?? 0.72,
    pageSize: cfg?.pageSize ?? 120,
    neighborK,
    cacheTtlMs: Math.max(0, cacheTtlSec) * 1000,
    excludeDomains: exclude.map(normalizeDomain).filter(Boolean),
    candidatePool:
      Number.isFinite(candidatePool) && candidatePool > 0
        ? Math.max(neighborK, Math.round(candidatePool))
        : Math.max(neighborK * 4, 24),
    facetWeight: Number.isFinite(facetWeight) ? Math.min(1, Math.max(0, facetWeight)) : 0.35,
    mmrLambda: Number.isFinite(mmrLambda) ? Math.min(1, Math.max(0, mmrLambda)) : 0.7
  };
}

export function normalizeDomain(value: string | null | undefined): string {
  if (!value) return "";
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return (host ?? "").replace(/:\d+$/, "");
}

export function isExcludedDomain(
  domain: string | null | undefined,
  excludeDomains: string[] = DEFAULT_EXCLUDE_DOMAINS
): boolean {
  const host = normalizeDomain(domain);
  if (!host) return false;
  return excludeDomains.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/** 0–1 affinity from closed craft facets (style + industry first). */
export function facetAffinity(
  a: ScreenFacetSummary | null | undefined,
  b: ScreenFacetSummary | null | undefined
): number {
  if (!a || !b) return 0.45;
  let score = 0;
  let weight = 0;

  if (a.style && b.style) {
    weight += 3;
    score += a.style === b.style ? 3 : 0;
  }
  const aInd = new Set((a.industry_tags ?? []).map((t) => t.toLowerCase()));
  const bInd = new Set((b.industry_tags ?? []).map((t) => t.toLowerCase()));
  if (aInd.size || bInd.size) {
    weight += 3;
    let overlap = 0;
    for (const tag of aInd) if (bInd.has(tag)) overlap += 1;
    score += aInd.size && bInd.size ? Math.min(3, (overlap / Math.min(aInd.size, bInd.size)) * 3) : 0;
  }
  if (a.contrast_mode && b.contrast_mode) {
    weight += 1;
    score += a.contrast_mode === b.contrast_mode ? 1 : 0;
  }
  if (a.imagery_density && b.imagery_density) {
    weight += 1;
    score += a.imagery_density === b.imagery_density ? 1 : 0;
  }
  if (a.type_scale && b.type_scale) {
    weight += 1;
    score += a.type_scale === b.type_scale ? 1 : 0;
  }
  return weight > 0 ? score / weight : 0.45;
}

export function sharesHardFacet(
  a: ScreenFacetSummary | null | undefined,
  b: ScreenFacetSummary | null | undefined
): boolean {
  if (!a || !b) return true;
  if (a.style && b.style && a.style === b.style) return true;
  const aInd = new Set((a.industry_tags ?? []).map((t) => t.toLowerCase()));
  for (const tag of b.industry_tags ?? []) {
    if (aInd.has(tag.toLowerCase())) return true;
  }
  // No closed facets to enforce → keep candidate
  if (!a.style && !(a.industry_tags?.length)) return true;
  if (!b.style && !(b.industry_tags?.length)) return true;
  return false;
}

export function combinedNeighborScore(
  cosine: number,
  affinity: number,
  facetWeight: number,
  hardFacetMatch: boolean
): number {
  const base = (1 - facetWeight) * cosine + facetWeight * affinity;
  // Soft demote when style/industry disagree (still allow very high cosine through)
  if (!hardFacetMatch && cosine < 0.95) return base * 0.55;
  return base;
}

type RankedCandidate = {
  id: string;
  cosine: number;
  score: number;
  domain: string;
  style: string | null;
};

/** Maximal Marginal Relevance — prefer relevance, punish same-domain / same-style repeats. */
export function mmrSelectNeighbors(
  candidates: RankedCandidate[],
  limit: number,
  lambda = 0.7
): RankedCandidate[] {
  if (limit <= 0 || !candidates.length) return [];
  const remaining = [...candidates].sort((a, b) => b.score - a.score);
  const picked: RankedCandidate[] = [];

  while (picked.length < limit && remaining.length) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const cand = remaining[i]!;
      let redundancy = 0;
      for (const prev of picked) {
        let sim = 0;
        if (cand.domain && prev.domain && cand.domain === prev.domain) sim = 1;
        else if (cand.style && prev.style && cand.style === prev.style) sim = 0.45;
        redundancy = Math.max(redundancy, sim);
      }
      const value = lambda * cand.score - (1 - lambda) * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIdx = i;
      }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]!);
  }
  return picked;
}

function mapNodes(rows: Array<Record<string, unknown>>): SimilarityGraphNode[] {
  return rows.map((row) => ({
    capture_run_id: String(row.capture_run_id ?? ""),
    site_domain: typeof row.site_domain === "string" ? row.site_domain : null,
    canonical_url: typeof row.canonical_url === "string" ? row.canonical_url : null,
    viewport_capture_id: typeof row.viewport_capture_id === "string" ? row.viewport_capture_id : null,
    title: typeof row.title === "string" ? row.title : null
  }));
}

/** Undirected edge key so a↔b collapses to one row. */
export function undirectedEdgeKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function clearSimilarityGraphCache(): void {
  graphCache.clear();
}

function cacheKey(kind: SimilarityGraphKind, nodeLimit: number, nodeCap: number): string {
  return nodeLimit >= nodeCap ? `full:${kind}` : `limit:${kind}:${nodeLimit}`;
}

function selectNeighborsForSeed(
  seed: SimilarityGraphNode,
  raw: Array<{ id: string; cosine: number }>,
  byId: Map<string, SimilarityGraphNode>,
  limits: ReturnType<typeof similarityGraphConfig>
): RankedCandidate[] {
  const seedFacets = seed.design_facets;
  const ranked: RankedCandidate[] = [];
  for (const hit of raw) {
    const other = byId.get(hit.id);
    if (!other) continue;
    if (isExcludedDomain(other.site_domain, limits.excludeDomains)) continue;
    const facets = other.design_facets;
    const affinity = facetAffinity(seedFacets, facets);
    const hard = sharesHardFacet(seedFacets, facets);
    ranked.push({
      id: hit.id,
      cosine: hit.cosine,
      score: combinedNeighborScore(hit.cosine, affinity, limits.facetWeight, hard),
      domain: normalizeDomain(other.site_domain),
      style: facets?.style ?? null
    });
  }

  // Facet-first: prefer hard matches, fill remainder only if needed
  const hard = ranked.filter((c) =>
    sharesHardFacet(seedFacets, byId.get(c.id)?.design_facets)
  );
  const hardIds = new Set(hard.map((c) => c.id));
  const soft = ranked.filter((c) => !hardIds.has(c.id));
  const primary = mmrSelectNeighbors(hard, limits.neighborK, limits.mmrLambda);
  if (primary.length >= limits.neighborK) return primary;
  const filler = mmrSelectNeighbors(soft, limits.neighborK - primary.length, limits.mmrLambda);
  return [...primary, ...filler];
}

async function buildSimilarityGraph(
  client: Queryable,
  kind: SimilarityGraphKind,
  nodeLimit: number,
  root: string
): Promise<SimilarityGraph> {
  const limits = similarityGraphConfig(root);
  const table = kind === "visual" ? screenshotEmbeddingConfig(root).table : denseEmbeddingConfig(root).table;
  const model = kind === "visual" ? screenshotEmbeddingConfig(root).model : denseEmbeddingConfig(root).model;
  const kindFilter = kind === "visual" ? "screenshot" : "screen";
  const capped = Math.max(2, Math.min(limits.nodeCap, Math.floor(nodeLimit)));
  // Over-fetch so junk-domain filter still fills nodeCap
  const fetchLimit = Math.min(limits.nodeCap * 2, Math.max(capped + 200, capped));

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM ${table} e
     WHERE e.subject_kind = $1 AND e.model = $2`,
    [kindFilter, model]
  );
  const total = Number((countResult.rows[0] as { total?: number } | undefined)?.total ?? 0);

  const nodeResult = await client.query(
    `SELECT e.capture_run_id, c.site_domain, c.canonical_url,
            (
              SELECT v.viewport_capture_id FROM viewports v
              WHERE v.capture_run_id = e.capture_run_id
              ORDER BY CASE WHEN v.name = 'desktop' THEN 0 ELSE 1 END, v.name
              LIMIT 1
            ) AS viewport_capture_id,
            (
              SELECT v.title FROM viewports v
              WHERE v.capture_run_id = e.capture_run_id
              ORDER BY CASE WHEN v.name = 'desktop' THEN 0 ELSE 1 END, v.name
              LIMIT 1
            ) AS title
     FROM ${table} e
     JOIN captures c ON c.capture_run_id = e.capture_run_id
     WHERE e.subject_kind = $1 AND e.model = $2
     ORDER BY e.created_at DESC
     LIMIT $3`,
    [kindFilter, model, fetchLimit]
  );

  const mapped = mapNodes(nodeResult.rows as Array<Record<string, unknown>>).filter(
    (node) => node.capture_run_id && !isExcludedDomain(node.site_domain, limits.excludeDomains)
  );
  const nodes = mapped.slice(0, capped);
  const ids = nodes.map((node) => node.capture_run_id);
  const facetByCapture = await loadScreenFacetsByCaptureIds(client, ids);
  const withFacets = nodes.map((node) => ({
    ...node,
    design_facets: facetByCapture.get(node.capture_run_id) ?? null
  }));
  const byId = new Map(withFacets.map((node) => [node.capture_run_id, node]));

  if (ids.length < 2) {
    return {
      kind,
      model,
      threshold: limits.threshold,
      total,
      page_size: limits.pageSize,
      neighbor_k: limits.neighborK,
      nodes: withFacets,
      edges: []
    };
  }

  const edgeResult = await client.query(
    `SELECT a.capture_run_id AS from_id, n.to_id, n.score
     FROM ${table} a
     CROSS JOIN LATERAL (
       SELECT b.capture_run_id AS to_id,
              1 - (a.embedding <=> b.embedding) AS score
       FROM ${table} b
       WHERE b.subject_kind = $1
         AND b.model = $2
         AND b.capture_run_id = ANY($3::text[])
         AND b.capture_run_id <> a.capture_run_id
         AND 1 - (a.embedding <=> b.embedding) >= $4
       ORDER BY a.embedding <=> b.embedding
       LIMIT $5
     ) n
     WHERE a.subject_kind = $1
       AND a.model = $2
       AND a.capture_run_id = ANY($3::text[])`,
    [kindFilter, model, ids, limits.threshold, limits.candidatePool]
  );

  const rawBySeed = new Map<string, Array<{ id: string; cosine: number }>>();
  for (const row of edgeResult.rows as Array<Record<string, unknown>>) {
    const from_id = String(row.from_id ?? "");
    const to_id = String(row.to_id ?? "");
    if (!from_id || !to_id || from_id === to_id) continue;
    const cosine = Number(row.score ?? 0);
    const list = rawBySeed.get(from_id) ?? [];
    list.push({ id: to_id, cosine });
    rawBySeed.set(from_id, list);
  }

  const byKey = new Map<string, SimilarityGraphEdge>();
  for (const seed of withFacets) {
    const raw = rawBySeed.get(seed.capture_run_id) ?? [];
    const selected = selectNeighborsForSeed(seed, raw, byId, limits);
    for (const hit of selected) {
      const key = undirectedEdgeKey(seed.capture_run_id, hit.id);
      const prev = byKey.get(key);
      // Keep cosine on the edge (inspector score), not the demoted combined score
      const edgeScore = hit.cosine;
      if (!prev || edgeScore > prev.score) {
        byKey.set(key, {
          from_id: seed.capture_run_id < hit.id ? seed.capture_run_id : hit.id,
          to_id: seed.capture_run_id < hit.id ? hit.id : seed.capture_run_id,
          score: edgeScore
        });
      }
    }
  }

  const edges = [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limits.edgeCap);

  return {
    kind,
    model,
    threshold: limits.threshold,
    total,
    page_size: limits.pageSize,
    neighbor_k: limits.neighborK,
    nodes: withFacets,
    edges
  };
}

export async function loadSimilarityGraph(
  client: Queryable,
  kind: SimilarityGraphKind = "craft",
  root = process.cwd(),
  options: LoadSimilarityGraphOptions = {}
): Promise<SimilarityGraph> {
  const limits = similarityGraphConfig(root);
  const nodeLimit = options.limit != null && Number.isFinite(options.limit) ? Number(options.limit) : limits.nodeCap;
  const key = cacheKey(kind, nodeLimit, limits.nodeCap);

  if (!options.refresh && limits.cacheTtlMs > 0) {
    const hit = graphCache.get(key);
    if (hit && Date.now() - hit.at < limits.cacheTtlMs) {
      return { ...hit.graph, cached: true };
    }
  }

  const graph = await buildSimilarityGraph(client, kind, nodeLimit, root);
  if (limits.cacheTtlMs > 0) {
    graphCache.set(key, { at: Date.now(), graph: { ...graph, cached: false } });
  }
  return { ...graph, cached: false };
}
