/**
 * Similarity graph over dense (craft text) or screenshot (visual) embeddings.
 * Full corpus (up to nodeCap) with kNN edges; in-process TTL cache for repeat hits.
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

export function similarityGraphConfig(root = process.cwd()): {
  nodeCap: number;
  edgeCap: number;
  threshold: number;
  pageSize: number;
  neighborK: number;
  cacheTtlMs: number;
} {
  const cfg = loadDigPaths(root).similarityGraph;
  const nodeCap = cfg?.nodeCap ?? 5000;
  const neighborK = cfg?.neighborK ?? 8;
  const cacheTtlSec = cfg?.cacheTtlSec ?? 600;
  return {
    nodeCap,
    edgeCap: cfg?.edgeCap ?? nodeCap * neighborK,
    threshold: cfg?.threshold ?? 0.72,
    pageSize: cfg?.pageSize ?? 120,
    neighborK,
    cacheTtlMs: Math.max(0, cacheTtlSec) * 1000
  };
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
    [kindFilter, model, capped]
  );

  const nodes = mapNodes(nodeResult.rows as Array<Record<string, unknown>>);
  const ids = nodes.map((node) => node.capture_run_id).filter(Boolean);
  const facetByCapture = await loadScreenFacetsByCaptureIds(client, ids);
  const withFacets = (list: SimilarityGraphNode[]) =>
    list.map((node) => ({
      ...node,
      design_facets: facetByCapture.get(node.capture_run_id) ?? null
    }));

  if (ids.length < 2) {
    return {
      kind,
      model,
      threshold: limits.threshold,
      total,
      page_size: limits.pageSize,
      neighbor_k: limits.neighborK,
      nodes: withFacets(nodes),
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
    [kindFilter, model, ids, limits.threshold, limits.neighborK]
  );

  const byKey = new Map<string, SimilarityGraphEdge>();
  for (const row of edgeResult.rows as Array<Record<string, unknown>>) {
    const from_id = String(row.from_id ?? "");
    const to_id = String(row.to_id ?? "");
    if (!from_id || !to_id || from_id === to_id) continue;
    const score = Number(row.score ?? 0);
    const key = undirectedEdgeKey(from_id, to_id);
    const prev = byKey.get(key);
    if (!prev || score > prev.score) {
      byKey.set(key, {
        from_id: from_id < to_id ? from_id : to_id,
        to_id: from_id < to_id ? to_id : from_id,
        score
      });
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
    nodes: withFacets(nodes),
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
