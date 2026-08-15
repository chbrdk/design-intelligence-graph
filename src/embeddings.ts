import { createHash } from "node:crypto";
import type { Queryable } from "./db.js";
import { loadDigPaths } from "./runtime-paths.js";

export const HASHING_EMBEDDING_MODEL = "dig-hashing-v1";

export function embeddingDims(root = process.cwd()): number {
  const configured = loadDigPaths(root).embeddings?.dims;
  return typeof configured === "number" && configured > 0 ? configured : 384;
}

export function embeddingModelName(root = process.cwd()): string {
  return loadDigPaths(root).embeddings?.model ?? HASHING_EMBEDDING_MODEL;
}

/** Deterministic bag-of-tokens hashing embedder (no external model required). */
export function hashEmbedText(text: string, dims = embeddingDims()): number[] {
  const vector = new Float64Array(dims);
  const tokens = text
    .toLocaleLowerCase()
    .split(/[^a-z0-9:#.>_-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
  if (!tokens.length) {
    vector[0] = 1;
    return Array.from(vector);
  }
  for (const token of tokens) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % dims;
    const sign = digest[4]! & 1 ? 1 : -1;
    const weight = 1 + (digest[5]! % 5) / 5;
    vector[index]! += sign * weight;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

export function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

export type EmbeddingSubject = {
  subject_kind: string;
  subject_id: string;
  content_text: string;
};

export async function upsertEmbeddings(
  client: Queryable,
  captureRunId: string,
  subjects: EmbeddingSubject[],
  root = process.cwd()
): Promise<number> {
  const dims = embeddingDims(root);
  const model = embeddingModelName(root);
  await client.query("DELETE FROM embeddings WHERE capture_run_id = $1", [captureRunId]);
  let written = 0;
  for (const subject of subjects) {
    const text = subject.content_text.trim();
    if (!text) continue;
    const embedding = hashEmbedText(text, dims);
    await client.query(
      `INSERT INTO embeddings (capture_run_id, subject_kind, subject_id, model, dims, content_text, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7::vector)
       ON CONFLICT (capture_run_id, subject_kind, subject_id) DO UPDATE SET
         model = EXCLUDED.model,
         dims = EXCLUDED.dims,
         content_text = EXCLUDED.content_text,
         embedding = EXCLUDED.embedding,
         created_at = NOW()`,
      [captureRunId, subject.subject_kind, subject.subject_id, model, dims, text, vectorLiteral(embedding)]
    );
    written += 1;
  }
  return written;
}

export async function searchEmbeddings(
  client: Queryable,
  query: string,
  limit = 20,
  root = process.cwd()
): Promise<Array<Record<string, unknown>>> {
  const dims = embeddingDims(root);
  const embedding = hashEmbedText(query, dims);
  const result = await client.query(
    `SELECT e.capture_run_id, e.subject_kind, e.subject_id, e.content_text, e.model,
            c.site_domain, c.canonical_url,
            1 - (e.embedding <=> $1::vector) AS score
     FROM embeddings e
     JOIN captures c ON c.capture_run_id = e.capture_run_id
     WHERE e.embedding IS NOT NULL
     ORDER BY e.embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral(embedding), Math.min(Math.max(limit, 1), 100)]
  );
  return result.rows;
}
