/**
 * Stage B dense embeddings via OpenRouter (Qwen3-Embedding).
 * @see knowledge/dense-embeddings.md
 */
import { createHash } from "node:crypto";
import type { Queryable } from "./db.js";
import { localLlmConfig } from "./llm-provider.js";
import { vectorLiteral } from "./embeddings.js";
import { loadDigPaths } from "./runtime-paths.js";

export type DenseEmbeddingSubject = {
  subject_kind: string;
  subject_id: string;
  content_text: string;
  canonical_sha256: string;
};

export type DenseEmbeddingConfig = {
  enabled: boolean;
  model: string;
  dims: number;
  table: string;
  queryInstruction: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  headers: Record<string, string>;
};

export function denseEmbeddingsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): boolean {
  const off = (environment.DIG_EMBEDDING_ENABLED ?? "").trim().toLowerCase();
  if (off === "false" || off === "0") return false;
  const forced = off === "true" || off === "1";
  const status = loadDigPaths(root).embeddings?.dense?.status ?? "concept";
  if (!forced && status !== "live") return false;
  const key = (environment.OPENROUTER_API_KEY ?? environment.DIG_LLM_API_KEY ?? "").trim();
  return Boolean(key);
}

export function denseEmbeddingConfig(root = process.cwd()): DenseEmbeddingConfig {
  const paths = loadDigPaths(root);
  const dense = paths.embeddings?.dense;
  const llm = localLlmConfig(process.env);
  const modelEnv = dense?.modelEnv ?? "DIG_EMBEDDING_MODEL";
  const baseUrlEnv = dense?.baseUrlEnv ?? "DIG_EMBEDDING_BASE_URL";
  const model =
    (process.env[modelEnv] ?? "").trim() || dense?.model || "qwen/qwen3-embedding-8b";
  const baseUrl =
    (process.env[baseUrlEnv] ?? "").trim() || llm.baseUrl.replace(/\/$/, "");
  const apiKey =
    (process.env.OPENROUTER_API_KEY ?? process.env.DIG_LLM_API_KEY ?? llm.apiKey ?? "").trim();
  return {
    enabled: denseEmbeddingsEnabled(process.env, root),
    model,
    dims: dense?.dims ?? 1024,
    table: dense?.table ?? "dense_embeddings",
    queryInstruction:
      dense?.queryInstruction ??
      "Retrieve website screens that match this visual craft: layout, type, imagery, contrast, and chrome.",
    baseUrl,
    apiKey,
    timeoutMs: llm.timeoutMs ?? 120_000,
    headers: llm.headers ?? {}
  };
}

export function canonicalSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function formatDenseQuery(query: string, root = process.cwd()): string {
  const instruction = denseEmbeddingConfig(root).queryInstruction.trim();
  const trimmed = query.trim();
  if (!instruction) return trimmed;
  return `${instruction}\n${trimmed}`;
}

export async function embedTextsOpenRouter(
  texts: string[],
  options: {
    model?: string;
    dims?: number;
    request?: typeof fetch;
    root?: string;
  } = {}
): Promise<number[][]> {
  const cfg = denseEmbeddingConfig(options.root);
  if (!cfg.apiKey) {
    throw new Error("dense_embeddings_require_api_key");
  }
  const cleaned = texts.map((text) => text.trim()).filter(Boolean);
  if (!cleaned.length) return [];
  const request = options.request ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await request(`${cfg.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${cfg.apiKey}`,
        ...cfg.headers
      },
      body: JSON.stringify({
        model: options.model ?? cfg.model,
        input: cleaned.length === 1 ? cleaned[0] : cleaned,
        dimensions: options.dims ?? cfg.dims
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      throw new Error(`dense_embedding_request_failed:${response.status}${detail ? `:${detail}` : ""}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const rows = [...(payload.data ?? [])].sort(
      (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)
    );
    if (rows.length !== cleaned.length) {
      throw new Error(`dense_embedding_count_mismatch:${rows.length}/${cleaned.length}`);
    }
    return rows.map((row) => {
      const vector = row.embedding ?? [];
      if (!vector.length) throw new Error("dense_embedding_empty_vector");
      return vector;
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function loadExistingDenseShaMap(
  client: Queryable,
  captureRunId: string,
  model: string,
  root = process.cwd()
): Promise<Map<string, string>> {
  const table = denseEmbeddingConfig(root).table;
  const result = await client.query(
    `SELECT subject_kind, subject_id, canonical_sha256
     FROM ${table}
     WHERE capture_run_id = $1 AND model = $2`,
    [captureRunId, model]
  );
  const map = new Map<string, string>();
  for (const row of result.rows as Array<{
    subject_kind?: string;
    subject_id?: string;
    canonical_sha256?: string;
  }>) {
    const kind = String(row.subject_kind ?? "");
    const id = String(row.subject_id ?? "");
    const sha = String(row.canonical_sha256 ?? "");
    if (kind && id && sha) map.set(`${kind}:${id}`, sha);
  }
  return map;
}

export async function upsertDenseEmbeddingSubjects(
  client: Queryable,
  captureRunId: string,
  subjects: DenseEmbeddingSubject[],
  vectors: number[][],
  root = process.cwd()
): Promise<number> {
  const cfg = denseEmbeddingConfig(root);
  if (subjects.length !== vectors.length) {
    throw new Error("dense_embedding_subject_vector_mismatch");
  }
  let written = 0;
  for (let i = 0; i < subjects.length; i += 1) {
    const subject = subjects[i]!;
    const vector = vectors[i]!;
    if (!subject.content_text.trim() || vector.length !== cfg.dims) continue;
    await client.query(
      `INSERT INTO ${cfg.table} (
         capture_run_id, subject_kind, subject_id, model, dims,
         content_text, canonical_sha256, embedding
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::vector)
       ON CONFLICT (capture_run_id, subject_kind, subject_id, model) DO UPDATE SET
         dims = EXCLUDED.dims,
         content_text = EXCLUDED.content_text,
         canonical_sha256 = EXCLUDED.canonical_sha256,
         embedding = EXCLUDED.embedding,
         created_at = NOW()`,
      [
        captureRunId,
        subject.subject_kind,
        subject.subject_id,
        cfg.model,
        cfg.dims,
        subject.content_text,
        subject.canonical_sha256,
        vectorLiteral(vector)
      ]
    );
    written += 1;
  }
  return written;
}

export async function searchDenseEmbeddings(
  client: Queryable,
  query: string,
  limit = 20,
  options: {
    subject_kind?: string;
    capture_run_ids?: string[];
    root?: string;
    request?: typeof fetch;
  } = {}
): Promise<Array<Record<string, unknown>>> {
  const root = options.root ?? process.cwd();
  const cfg = denseEmbeddingConfig(root);
  const [vector] = await embedTextsOpenRouter([formatDenseQuery(query, root)], {
    model: cfg.model,
    dims: cfg.dims,
    ...(options.request ? { request: options.request } : {}),
    root
  });
  if (!vector) return [];
  const clauses = ["e.embedding IS NOT NULL"];
  const values: unknown[] = [vectorLiteral(vector)];
  if (options.subject_kind?.trim()) {
    values.push(options.subject_kind.trim());
    clauses.push(`e.subject_kind = $${values.length}`);
  }
  if (options.capture_run_ids?.length) {
    values.push(options.capture_run_ids);
    clauses.push(`e.capture_run_id = ANY($${values.length}::text[])`);
  }
  values.push(Math.min(Math.max(limit, 1), 100));
  const result = await client.query(
    `SELECT e.capture_run_id, e.subject_kind, e.subject_id, e.content_text, e.model,
            c.site_domain, c.canonical_url,
            1 - (e.embedding <=> $1::vector) AS score
     FROM ${cfg.table} e
     JOIN captures c ON c.capture_run_id = e.capture_run_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.embedding <=> $1::vector
     LIMIT $${values.length}`,
    values
  );
  return result.rows as Array<Record<string, unknown>>;
}
