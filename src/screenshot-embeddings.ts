/**
 * Stage C screenshot embeddings (Gemini Embedding 2 via OpenRouter).
 * Separate table from hashing 384 and dense text 1024.
 * @see knowledge/screenshot-embeddings.md
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Queryable } from "./db.js";
import { vectorLiteral } from "./embeddings.js";
import { localLlmConfig } from "./llm-provider.js";
import { libraryFullPageScreenshotPath } from "./library-screenshot.js";
import { loadDigPaths } from "./runtime-paths.js";

export type ScreenshotEmbeddingConfig = {
  enabled: boolean;
  model: string;
  dims: number;
  table: string;
  queryInstruction: string;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  headers: Record<string, string>;
  maxBytes: number;
};

type CaptureManifest = {
  capture_run_id?: string;
  viewport_captures?: Array<{
    name?: string;
    artifacts?: {
      playwright_full_page_screenshot?: { path?: string } | null;
      full_page_screenshot?: { path?: string } | null;
    };
  }>;
};

export function screenshotEmbeddingsEnabled(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): boolean {
  const off = (environment.DIG_SCREENSHOT_EMBEDDING_ENABLED ?? "").trim().toLowerCase();
  if (off === "false" || off === "0") return false;
  const forced = off === "true" || off === "1";
  const status = loadDigPaths(root).embeddings?.screenshot?.status ?? "concept";
  if (!forced && status !== "live") return false;
  const key = (environment.OPENROUTER_API_KEY ?? environment.DIG_LLM_API_KEY ?? "").trim();
  return Boolean(key);
}

export function screenshotEmbeddingConfig(root = process.cwd()): ScreenshotEmbeddingConfig {
  const paths = loadDigPaths(root);
  const shot = paths.embeddings?.screenshot;
  const llm = localLlmConfig(process.env);
  const modelEnv = shot?.modelEnv ?? "DIG_SCREENSHOT_EMBEDDING_MODEL";
  const model = (process.env[modelEnv] ?? "").trim() || shot?.model || "google/gemini-embedding-2";
  const baseUrl = (process.env[shot?.baseUrlEnv ?? "DIG_EMBEDDING_BASE_URL"] ?? "").trim() || llm.baseUrl.replace(/\/$/, "");
  const apiKey = (process.env.OPENROUTER_API_KEY ?? process.env.DIG_LLM_API_KEY ?? llm.apiKey ?? "").trim();
  return {
    enabled: screenshotEmbeddingsEnabled(process.env, root),
    model,
    dims: shot?.dims ?? 768,
    table: shot?.table ?? "screenshot_embeddings",
    queryInstruction:
      shot?.queryInstruction ??
      "Retrieve website screenshots that match this visual look: composition, type, imagery, and chrome.",
    baseUrl,
    apiKey,
    timeoutMs: llm.timeoutMs ?? 120_000,
    headers: llm.headers ?? {},
    maxBytes: shot?.maxBytes ?? 2_000_000
  };
}

function mimeForPath(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "image/webp";
}

export async function resolveDesktopScreenshotPath(packageRoot: string, root = process.cwd()): Promise<string | null> {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
  const viewports = [...(manifest.viewport_captures ?? [])];
  viewports.sort((a, b) => {
    const rank = (name: string) => (name === "desktop" ? 0 : 1);
    return rank(String(a.name ?? "")) - rank(String(b.name ?? ""));
  });
  const preferred = viewports[0];
  if (!preferred?.artifacts) return null;
  return libraryFullPageScreenshotPath(preferred.artifacts, root);
}

export async function embedScreenshotOpenRouter(
  dataUrl: string,
  options: { request?: typeof fetch; root?: string } = {}
): Promise<number[]> {
  const cfg = screenshotEmbeddingConfig(options.root);
  if (!cfg.apiKey) throw new Error("screenshot_embeddings_require_api_key");
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
        model: cfg.model,
        input: [{ content: [{ type: "image_url", image_url: { url: dataUrl } }] }],
        dimensions: cfg.dims,
        encoding_format: "float"
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240);
      throw new Error(`screenshot_embedding_request_failed:${response.status}${detail ? `:${detail}` : ""}`);
    }
    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const vector = payload.data?.[0]?.embedding ?? [];
    if (vector.length !== cfg.dims) {
      throw new Error(`screenshot_embedding_dims:${vector.length}`);
    }
    return vector;
  } finally {
    clearTimeout(timer);
  }
}

export function formatScreenshotQuery(query: string, root = process.cwd()): string {
  const instruction = screenshotEmbeddingConfig(root).queryInstruction.trim();
  const trimmed = query.trim();
  if (!instruction) return trimmed;
  return `${instruction}\n${trimmed}`;
}

export async function searchScreenshotEmbeddings(
  client: Queryable,
  query: string,
  limit = 20,
  options: { capture_run_ids?: string[]; root?: string; request?: typeof fetch } = {}
): Promise<Array<Record<string, unknown>>> {
  const root = options.root ?? process.cwd();
  const cfg = screenshotEmbeddingConfig(root);
  const { embedTextsOpenRouter } = await import("./dense-embeddings.js");
  const [vector] = await embedTextsOpenRouter([formatScreenshotQuery(query, root)], {
    model: cfg.model,
    dims: cfg.dims,
    ...(options.request ? { request: options.request } : {}),
    root
  });
  if (!vector) return [];
  const clauses = ["e.embedding IS NOT NULL", "e.subject_kind = 'screenshot'"];
  const values: unknown[] = [vectorLiteral(vector)];
  if (options.capture_run_ids?.length) {
    values.push(options.capture_run_ids);
    clauses.push(`e.capture_run_id = ANY($${values.length}::text[])`);
  }
  values.push(Math.min(Math.max(limit, 1), 100));
  const result = await client.query(
    `SELECT e.capture_run_id, e.subject_kind, e.subject_id, e.model,
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

export async function embedScreenshotForPackage(
  packageRoot: string,
  options: { client?: Queryable | null; request?: typeof fetch; root?: string; onSkip?: (reason: string) => void } = {}
): Promise<number> {
  const root = options.root ?? process.cwd();
  if (!screenshotEmbeddingsEnabled(process.env, root)) {
    options.onSkip?.("disabled");
    return 0;
  }
  const { getPool } = await import("./db.js");
  const client = options.client ?? getPool();
  if (!client) throw new Error("database_unavailable");
  const cfg = screenshotEmbeddingConfig(root);
  let relative = await resolveDesktopScreenshotPath(packageRoot, root).catch(() => null);
  if (!relative) {
    // Fallback: query the viewports table for the full_page_screenshot_path
    const manifest = await readFile(resolve(packageRoot, "manifest.json"), "utf8").catch(() => null);
    const captureId = manifest ? (JSON.parse(manifest) as { capture_run_id?: string }).capture_run_id : null;
    if (captureId) {
      const vp = await client.query(
        `SELECT full_page_screenshot_path, settled_screenshot_path
         FROM viewports
         WHERE capture_run_id = $1 AND name = 'desktop'
         LIMIT 1`,
        [captureId]
      );
      const row = vp.rows[0] as { full_page_screenshot_path?: string; settled_screenshot_path?: string } | undefined;
      relative = row?.full_page_screenshot_path ?? row?.settled_screenshot_path ?? null;
    }
  }
  if (!relative) {
    options.onSkip?.("no_screenshot_path");
    return 0;
  }
  const absPath = relative.startsWith("/") ? relative : resolve(packageRoot, relative);
  const bytes = await readFile(absPath);
  if (bytes.byteLength === 0 || bytes.byteLength > cfg.maxBytes) {
    options.onSkip?.(`size_${bytes.byteLength}`);
    return 0;
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const manifestRaw = await readFile(resolve(packageRoot, "manifest.json"), "utf8");
  const captureRunId = (JSON.parse(manifestRaw) as { capture_run_id: string }).capture_run_id;
  const existing = await client.query(
    `SELECT canonical_sha256 FROM ${cfg.table}
     WHERE capture_run_id = $1 AND subject_kind = 'screenshot' AND model = $2
     LIMIT 1`,
    [captureRunId, cfg.model]
  );
  if ((existing.rows[0] as { canonical_sha256?: string } | undefined)?.canonical_sha256 === sha) {
    return 0;
  }
  const mime = mimeForPath(relative);
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  const vector = await embedScreenshotOpenRouter(dataUrl, {
    ...(options.request ? { request: options.request } : {}),
    ...(options.root ? { root: options.root } : {})
  });
  await client.query(
    `INSERT INTO ${cfg.table} (
       capture_run_id, subject_kind, subject_id, model, dims, media_path, canonical_sha256, embedding
     ) VALUES ($1,'screenshot',$2,$3,$4,$5,$6,$7::vector)
     ON CONFLICT (capture_run_id, subject_kind, subject_id, model) DO UPDATE SET
       dims = EXCLUDED.dims,
       media_path = EXCLUDED.media_path,
       canonical_sha256 = EXCLUDED.canonical_sha256,
       embedding = EXCLUDED.embedding,
       created_at = NOW()`,
    [captureRunId, captureRunId, cfg.model, cfg.dims, relative, sha, vectorLiteral(vector)]
  );
  return 1;
}

export async function listCapturesMissingScreenshots(
  client: Queryable,
  limit: number,
  root = process.cwd()
): Promise<Array<{ capture_run_id: string; package_path: string }>> {
  const cfg = screenshotEmbeddingConfig(root);
  const capped = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await client.query(
    `SELECT c.capture_run_id, c.package_path
     FROM captures c
     JOIN llm_analyses la ON la.capture_run_id = c.capture_run_id AND la.status = 'complete'
     WHERE c.package_path IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM ${cfg.table} se
         WHERE se.capture_run_id = c.capture_run_id
           AND se.subject_kind = 'screenshot'
           AND se.model = $1
       )
     ORDER BY c.indexed_at DESC NULLS LAST
     LIMIT $2`,
    [cfg.model, capped]
  );
  return result.rows as Array<{ capture_run_id: string; package_path: string }>;
}
