/**
 * DIG-012 DesignReference embeddings (hashing provider) + similar_to ranking.
 * @see docs/DIG-012-embeddings.md
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Queryable } from "./db.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { buildEmbeddingCanonical, type DesignReferenceLike } from "./design-reference-spec.js";
import {
  embeddingDims,
  embeddingModelName,
  hashEmbedText,
  upsertEmbeddingSubjects,
  vectorLiteral,
  type EmbeddingSubject
} from "./embeddings.js";

export const DESIGN_REFERENCE_EMBEDDING_KIND = "design_reference" as const;
export const DESIGN_REFERENCE_EMBEDDINGS_RELATIVE_PATH = "derived/design-references.embeddings.jsonl";

export type DesignReferenceEmbeddingRow = {
  reference_id: string;
  provider: string;
  dims: number;
  vector: number[];
  canonical_sha256: string;
};

export function designReferenceEmbeddingProvider(root = process.cwd()): string {
  try {
    const paths = JSON.parse(readFileSync(resolve(root, "knowledge/paths.json"), "utf8")) as {
      taxonomy?: { designReferenceEmbeddings?: { hashingModel?: string } };
    };
    return paths.taxonomy?.designReferenceEmbeddings?.hashingModel ?? embeddingModelName(root);
  } catch {
    return embeddingModelName(root);
  }
}

export function embeddingSubjectForReference(
  ref: DesignReferenceRecord | (DesignReferenceLike & { reference_id: string; capture_run_id?: string }),
  root = process.cwd()
): EmbeddingSubject {
  return {
    subject_kind: DESIGN_REFERENCE_EMBEDDING_KIND,
    subject_id: ref.reference_id,
    content_text: buildEmbeddingCanonical(ref as DesignReferenceLike)
  };
}

export function buildDesignReferenceEmbeddingRow(
  ref: DesignReferenceRecord | (DesignReferenceLike & { reference_id: string }),
  root = process.cwd()
): DesignReferenceEmbeddingRow {
  const canonical = buildEmbeddingCanonical(ref as DesignReferenceLike);
  const dims = embeddingDims(root);
  return {
    reference_id: ref.reference_id,
    provider: designReferenceEmbeddingProvider(root),
    dims,
    vector: hashEmbedText(canonical, dims),
    canonical_sha256: createHash("sha256").update(canonical).digest("hex")
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/** Offline rank — no DB. Filters apply before vector rank. */
export function rankReferencesBySimilarity(input: {
  anchor: DesignReferenceLike & { reference_id: string };
  corpus: Array<DesignReferenceLike & { reference_id: string; composition?: { signature?: string }; taxonomy?: { category?: string } }>;
  category?: string;
  signature?: string;
  style_label?: string;
  limit?: number;
  root?: string;
}): Array<{ reference_id: string; score: number }> {
  const root = input.root ?? process.cwd();
  const anchorVec = hashEmbedText(buildEmbeddingCanonical(input.anchor), embeddingDims(root));
  let candidates = input.corpus.filter((ref) => ref.reference_id !== input.anchor.reference_id);
  if (input.category?.trim()) {
    candidates = candidates.filter((ref) => (ref.taxonomy?.category ?? "") === input.category!.trim());
  }
  if (input.signature?.trim()) {
    candidates = candidates.filter((ref) => (ref.composition?.signature ?? "") === input.signature!.trim());
  }
  if (input.style_label?.trim()) {
    const needle = input.style_label.trim().toLowerCase();
    candidates = candidates.filter((ref) =>
      (ref.tokens?.style_labels ?? []).some((label) => label.toLowerCase().includes(needle))
    );
  }
  const scored = candidates
    .map((ref) => {
      const score = cosineSimilarity(anchorVec, hashEmbedText(buildEmbeddingCanonical(ref), embeddingDims(root)));
      return {
        reference_id: ref.reference_id,
        score,
        signature: ref.composition?.signature ?? "",
        category: ref.taxonomy?.category ?? ""
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const anchorSig = input.anchor.composition?.signature ?? "";
      const aMatch = a.signature === anchorSig ? 0 : 1;
      const bMatch = b.signature === anchorSig ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.category.localeCompare(b.category) || a.reference_id.localeCompare(b.reference_id);
    });
  const limit = Math.max(1, Math.min(20, input.limit ?? 20));
  return scored.slice(0, limit).map(({ reference_id, score }) => ({ reference_id, score }));
}

export async function writeDesignReferenceEmbeddingsSidecar(
  packageRoot: string,
  references: DesignReferenceRecord[],
  root = process.cwd()
): Promise<{ path: string; count: number }> {
  const rows = references.map((ref) => buildDesignReferenceEmbeddingRow(ref, root));
  const body = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
  const relative = DESIGN_REFERENCE_EMBEDDINGS_RELATIVE_PATH;
  await writeFile(resolve(packageRoot, relative), body, "utf8");
  return { path: relative, count: rows.length };
}

export async function upsertDesignReferenceEmbeddings(
  client: Queryable,
  captureRunId: string,
  references: DesignReferenceRecord[],
  root = process.cwd()
): Promise<number> {
  const subjects = references.map((ref) => embeddingSubjectForReference(ref, root));
  return upsertEmbeddingSubjects(client, captureRunId, subjects, root);
}

export async function searchDesignReferenceEmbeddingNeighbors(
  client: Queryable,
  input: {
    similarTo: string;
    category?: string | undefined;
    signature?: string | undefined;
    style_label?: string | undefined;
    captureRunIds?: string[] | undefined;
    platformProjectId?: string | null | undefined;
    digProjectId?: string | null | undefined;
    limit?: number | undefined;
  },
  root = process.cwd()
): Promise<Array<{ reference_id: string; score: number; payload: DesignReferenceRecord }>> {
  const limit = Math.max(1, Math.min(20, input.limit ?? 20));
  if (input.captureRunIds && !input.captureRunIds.length) return [];
  const anchorResult = await client.query(
    `SELECT e.content_text, e.embedding::text AS embedding_text, r.payload
     FROM embeddings e
     JOIN design_references r ON r.reference_id = e.subject_id AND r.capture_run_id = e.capture_run_id
     WHERE e.subject_kind = $1 AND e.subject_id = $2
     LIMIT 1`,
    [DESIGN_REFERENCE_EMBEDDING_KIND, input.similarTo.trim()]
  );
  let anchorVec: number[] | null = null;
  const anchorRow = anchorResult.rows[0] as
    | { content_text?: string; embedding_text?: string; payload?: DesignReferenceRecord }
    | undefined;
  if (anchorRow?.embedding_text) {
    anchorVec = parseVectorLiteral(anchorRow.embedding_text);
  } else if (anchorRow?.payload) {
    anchorVec = hashEmbedText(buildEmbeddingCanonical(anchorRow.payload as DesignReferenceLike), embeddingDims(root));
  } else {
    const fallback = await client.query(`SELECT payload FROM design_references WHERE reference_id = $1 LIMIT 1`, [
      input.similarTo.trim()
    ]);
    const payload = (fallback.rows[0] as { payload?: DesignReferenceRecord } | undefined)?.payload;
    if (!payload) return [];
    anchorVec = hashEmbedText(buildEmbeddingCanonical(payload as DesignReferenceLike), embeddingDims(root));
  }

  const clauses = [`e.subject_kind = $1`, `e.subject_id <> $2`, `e.embedding IS NOT NULL`];
  const values: unknown[] = [DESIGN_REFERENCE_EMBEDDING_KIND, input.similarTo.trim(), vectorLiteral(anchorVec)];
  if (input.platformProjectId?.trim()) {
    values.push(input.platformProjectId.trim());
    clauses.push(`r.platform_project_id = $${values.length}`);
  }
  if (input.digProjectId?.trim()) {
    values.push(input.digProjectId.trim());
    clauses.push(`r.dig_project_id = $${values.length}`);
  }
  if (input.category?.trim()) {
    values.push(input.category.trim());
    clauses.push(`r.category = $${values.length}`);
  }
  if (input.signature?.trim()) {
    values.push(input.signature.trim());
    clauses.push(`r.signature = $${values.length}`);
  }
  if (input.style_label?.trim()) {
    values.push(JSON.stringify([input.style_label.trim()]));
    clauses.push(`r.style_labels @> $${values.length}::jsonb`);
  }
  if (input.captureRunIds?.length) {
    values.push(input.captureRunIds);
    clauses.push(`r.capture_run_id = ANY($${values.length}::text[])`);
  }
  values.push(limit);
  const result = await client.query(
    `SELECT r.reference_id, r.payload, r.signature, r.category,
            1 - (e.embedding <=> $3::vector) AS score
     FROM embeddings e
     JOIN design_references r ON r.reference_id = e.subject_id AND r.capture_run_id = e.capture_run_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.embedding <=> $3::vector,
              CASE WHEN r.signature = (SELECT signature FROM design_references WHERE reference_id = $2 LIMIT 1) THEN 0 ELSE 1 END,
              r.category,
              r.reference_id
     LIMIT $${values.length}`,
    values
  );
  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    reference_id: String(row.reference_id),
    score: Number(row.score ?? 0),
    payload: row.payload as DesignReferenceRecord
  }));
}

function parseVectorLiteral(text: string): number[] {
  const trimmed = text.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) return [];
  return trimmed.split(",").map((part) => Number(part.trim()));
}
