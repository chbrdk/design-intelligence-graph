/**
 * Similarity graph over dense (craft text) or screenshot (visual) embeddings.
 * @see knowledge/similarity-graph.md
 */
import type { Queryable } from "./db.js";
import { denseEmbeddingConfig } from "./dense-embeddings.js";
import { screenshotEmbeddingConfig } from "./screenshot-embeddings.js";
import { loadDigPaths } from "./runtime-paths.js";

export type SimilarityGraphKind = "craft" | "visual";

export type SimilarityGraphNode = {
  capture_run_id: string;
  site_domain: string | null;
  canonical_url: string | null;
  viewport_capture_id: string | null;
  title: string | null;
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
  nodes: SimilarityGraphNode[];
  edges: SimilarityGraphEdge[];
};

export function similarityGraphConfig(root = process.cwd()): {
  nodeCap: number;
  edgeCap: number;
  threshold: number;
} {
  const cfg = loadDigPaths(root).similarityGraph;
  return {
    nodeCap: cfg?.nodeCap ?? 250,
    edgeCap: cfg?.edgeCap ?? 750,
    threshold: cfg?.threshold ?? 0.72
  };
}

export async function loadSimilarityGraph(
  client: Queryable,
  kind: SimilarityGraphKind = "craft",
  root = process.cwd()
): Promise<SimilarityGraph> {
  const limits = similarityGraphConfig(root);
  const table = kind === "visual" ? screenshotEmbeddingConfig(root).table : denseEmbeddingConfig(root).table;
  const model = kind === "visual" ? screenshotEmbeddingConfig(root).model : denseEmbeddingConfig(root).model;
  const kindFilter = kind === "visual" ? "screenshot" : "screen";

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
    [kindFilter, model, limits.nodeCap]
  );

  const nodes: SimilarityGraphNode[] = (nodeResult.rows as Array<Record<string, unknown>>).map((row) => ({
    capture_run_id: String(row.capture_run_id ?? ""),
    site_domain: typeof row.site_domain === "string" ? row.site_domain : null,
    canonical_url: typeof row.canonical_url === "string" ? row.canonical_url : null,
    viewport_capture_id: typeof row.viewport_capture_id === "string" ? row.viewport_capture_id : null,
    title: typeof row.title === "string" ? row.title : null
  }));

  const ids = nodes.map((node) => node.capture_run_id).filter(Boolean);
  if (ids.length < 2) {
    return { kind, model, threshold: limits.threshold, nodes, edges: [] };
  }

  const edgeResult = await client.query(
    `SELECT a.capture_run_id AS from_id, b.capture_run_id AS to_id,
            1 - (a.embedding <=> b.embedding) AS score
     FROM ${table} a
     JOIN ${table} b
       ON a.subject_kind = $1 AND b.subject_kind = $1
      AND a.model = $2 AND b.model = $2
      AND a.capture_run_id < b.capture_run_id
      AND a.capture_run_id = ANY($3::text[])
      AND b.capture_run_id = ANY($3::text[])
     WHERE 1 - (a.embedding <=> b.embedding) >= $4
     ORDER BY score DESC
     LIMIT $5`,
    [kindFilter, model, ids, limits.threshold, limits.edgeCap]
  );

  const edges: SimilarityGraphEdge[] = (edgeResult.rows as Array<Record<string, unknown>>).map((row) => ({
    from_id: String(row.from_id ?? ""),
    to_id: String(row.to_id ?? ""),
    score: Number(row.score ?? 0)
  }));

  return { kind, model, threshold: limits.threshold, nodes, edges };
}
