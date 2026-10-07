/**
 * Content-hash idempotency for still-image / graphic uploads (Welle 2 B2).
 * Spec: plexon knowledge/spirion-campaign-motif-tickets.md Epic B2
 */
import { readFile, unlink } from "node:fs/promises";
import type { Queryable } from "./db.js";
import { hashImageBuffer } from "./composition-contract.js";
import type { UploadedImageIngest } from "./image-ingest.js";

export type ExistingCaptureByHash = {
  capture_run_id: string;
  content_hash: string;
  asset_kind: string | null;
  craft_eligible: boolean | null;
  enrichment_status: string | null;
};

export type DuplicateUpload = {
  filename: string;
  content_hash: string;
  capture_run_id: string;
  reason: "content_hash_exists";
  asset_kind: string | null;
  craft_eligible: boolean | null;
  enrichment_status: string | null;
};

export async function findCaptureByContentHash(
  client: Queryable,
  contentHash: string
): Promise<ExistingCaptureByHash | null> {
  const trimmed = contentHash.trim();
  if (!trimmed) return null;
  const result = await client.query(
    `SELECT capture_run_id, content_hash, asset_kind, craft_eligible, enrichment_status
     FROM captures
     WHERE content_hash = $1
     ORDER BY indexed_at DESC NULLS LAST
     LIMIT 1`,
    [trimmed]
  );
  const row = result.rows[0] as
    | {
        capture_run_id?: unknown;
        content_hash?: unknown;
        asset_kind?: unknown;
        craft_eligible?: unknown;
        enrichment_status?: unknown;
      }
    | undefined;
  if (!row || typeof row.capture_run_id !== "string" || !row.capture_run_id) return null;
  return {
    capture_run_id: row.capture_run_id,
    content_hash: typeof row.content_hash === "string" ? row.content_hash : trimmed,
    asset_kind: typeof row.asset_kind === "string" ? row.asset_kind : null,
    craft_eligible: typeof row.craft_eligible === "boolean" ? row.craft_eligible : null,
    enrichment_status: typeof row.enrichment_status === "string" ? row.enrichment_status : null
  };
}

export async function partitionUploadsByContentHash(
  files: UploadedImageIngest[],
  client: Queryable
): Promise<{ novel: UploadedImageIngest[]; duplicates: DuplicateUpload[] }> {
  const novel: UploadedImageIngest[] = [];
  const duplicates: DuplicateUpload[] = [];
  const seenInBatch = new Map<string, string>();

  for (const file of files) {
    let contentHash: string;
    try {
      const bytes = await readFile(file.path);
      contentHash = await hashImageBuffer(bytes);
    } catch {
      novel.push(file);
      continue;
    }

    const batchHit = seenInBatch.get(contentHash);
    if (batchHit) {
      duplicates.push({
        filename: file.filename,
        content_hash: contentHash,
        capture_run_id: batchHit,
        reason: "content_hash_exists",
        asset_kind: file.asset_kind ?? null,
        craft_eligible: null,
        enrichment_status: null
      });
      await unlink(file.path).catch(() => undefined);
      continue;
    }

    const existing = await findCaptureByContentHash(client, contentHash);
    if (existing) {
      duplicates.push({
        filename: file.filename,
        content_hash: contentHash,
        capture_run_id: existing.capture_run_id,
        reason: "content_hash_exists",
        asset_kind: existing.asset_kind,
        craft_eligible: existing.craft_eligible,
        enrichment_status: existing.enrichment_status
      });
      await unlink(file.path).catch(() => undefined);
      continue;
    }

    seenInBatch.set(contentHash, `pending:${file.source_id}`);
    novel.push(file);
  }

  return { novel, duplicates };
}
