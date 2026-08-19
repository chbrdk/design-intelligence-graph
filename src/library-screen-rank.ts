/**
 * Facet-first Library screens, then dense or screenshot cosine rank when a query is present.
 * @see knowledge/dense-embeddings.md
 * @see knowledge/screenshot-embeddings.md
 */
import type { Queryable } from "./db.js";
import { denseEmbeddingsEnabled, searchDenseEmbeddings } from "./dense-embeddings.js";
import { screenshotEmbeddingsEnabled, searchScreenshotEmbeddings } from "./screenshot-embeddings.js";

export type ScreenSearchProvider = "dense" | "hashing" | "screenshot";

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
