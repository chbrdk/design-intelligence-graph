/**
 * Embed one enriched capture package into dense_embeddings.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEmbeddingCanonical, type DesignReferenceLike } from "./design-reference-spec.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { getPool, type Queryable } from "./db.js";
import { buildDenseEmbeddingSubjects } from "./dense-embedding-subjects.js";
import {
  canonicalSha256,
  denseEmbeddingConfig,
  denseEmbeddingsEnabled,
  embedTextsOpenRouter,
  loadExistingDenseShaMap,
  upsertDenseEmbeddingSubjects,
  type DenseEmbeddingSubject
} from "./dense-embeddings.js";

const DESIGN_REFERENCE_KIND = "design_reference";

async function captureRunIdForPackage(packageRoot: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(resolve(packageRoot, "manifest.json"), "utf8")
  ) as { capture_run_id?: string };
  const id = manifest.capture_run_id?.trim();
  if (!id) throw new Error("capture_run_id_missing");
  return id;
}

function subjectsNeedingEmbed(
  subjects: DenseEmbeddingSubject[],
  existing: Map<string, string>
): DenseEmbeddingSubject[] {
  return subjects.filter((subject) => {
    const key = `${subject.subject_kind}:${subject.subject_id}`;
    return existing.get(key) !== subject.canonical_sha256;
  });
}

export function denseSubjectsForDesignReferences(
  references: DesignReferenceRecord[],
  root = process.cwd()
): DenseEmbeddingSubject[] {
  return references.map((ref) => {
    const content_text = buildEmbeddingCanonical(ref as DesignReferenceLike);
    return {
      subject_kind: DESIGN_REFERENCE_KIND,
      subject_id: ref.reference_id,
      content_text,
      canonical_sha256: canonicalSha256(content_text)
    };
  });
}

export async function embedDenseSubjectsForCapture(
  client: Queryable,
  captureRunId: string,
  subjects: DenseEmbeddingSubject[],
  options: { request?: typeof fetch; root?: string } = {}
): Promise<number> {
  const root = options.root ?? process.cwd();
  if (!denseEmbeddingsEnabled(process.env, root)) return 0;
  const cfg = denseEmbeddingConfig(root);
  const existing = await loadExistingDenseShaMap(client, captureRunId, cfg.model, root);
  const pending = subjectsNeedingEmbed(subjects, existing);
  if (!pending.length) return 0;
  const vectors = await embedTextsOpenRouter(
    pending.map((subject) => subject.content_text),
    { request: options.request, root }
  );
  return upsertDenseEmbeddingSubjects(client, captureRunId, pending, vectors, root);
}

export async function embedDenseCapturePackage(
  packageRoot: string,
  options: { client?: Queryable | null; request?: typeof fetch; root?: string } = {}
): Promise<{ written: number; subjects: number }> {
  const root = options.root ?? process.cwd();
  if (!denseEmbeddingsEnabled(process.env, root)) {
    return { written: 0, subjects: 0 };
  }
  const client = options.client ?? getPool();
  if (!client) throw new Error("database_unavailable");
  const captureRunId = await captureRunIdForPackage(packageRoot);
  const subjects = await buildDenseEmbeddingSubjects(packageRoot, captureRunId, root);
  if (!subjects.length) return { written: 0, subjects: 0 };
  const written = await embedDenseSubjectsForCapture(client, captureRunId, subjects, options);
  return { written, subjects: subjects.length };
}

export async function listCapturesMissingDenseScreens(
  client: Queryable,
  limit: number,
  root = process.cwd()
): Promise<Array<{ capture_run_id: string; package_path: string }>> {
  const table = denseEmbeddingConfig(root).table;
  const model = denseEmbeddingConfig(root).model;
  const capped = Math.max(1, Math.min(500, Math.floor(limit)));
  const result = await client.query(
    `SELECT c.capture_run_id, c.package_path
     FROM captures c
     JOIN llm_analyses la ON la.capture_run_id = c.capture_run_id AND la.status = 'complete'
     WHERE c.package_path IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM ${table} de
         WHERE de.capture_run_id = c.capture_run_id
           AND de.subject_kind = 'screen'
           AND de.model = $1
       )
     ORDER BY c.indexed_at DESC NULLS LAST
     LIMIT $2`,
    [model, capped]
  );
  return result.rows as Array<{ capture_run_id: string; package_path: string }>;
}
