/**
 * DIG-012 Wave 2 — DesignReference library search / get / pack (Collection-aware).
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Queryable } from "./db.js";
import { getPool, runMigrations } from "./db.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { DESIGN_REFERENCES_RELATIVE_PATH } from "./design-reference-emit.js";
import { getFederationMode } from "./federation-mode.js";

export type DesignReferenceSearchQuery = {
  query?: string | undefined;
  category?: string | undefined;
  signature?: string | undefined;
  style_label?: string | undefined;
  style?: string | undefined;
  layout?: string | undefined;
  industry?: string | undefined;
  similar_to?: string | undefined;
  platformProjectId?: string | null | undefined;
  digProjectId?: string | null | undefined;
  limit?: number | undefined;
};

export type DesignReferencePackInput = {
  intent: string;
  reference_ids: string[];
  synthesis_mode?: "structural" | "look_conditioned" | undefined;
  platformProjectId?: string | null | undefined;
};

export type DesignReferencePack = {
  schema_version: "0.1.0";
  intent: string;
  references: DesignReferenceRecord[];
  synthesis_mode: "structural" | "look_conditioned";
  constraints: { forbid_source_copy: true };
};

function clampLimit(limit: unknown): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 20;
  return Math.max(1, Math.min(20, Math.floor(limit)));
}

export function assertCollectionScopeAllowed(platformProjectId?: string | null): void {
  if (getFederationMode() === "live" && !platformProjectId?.trim()) {
    throw new Error("platformProjectId required when DIG_FEDERATION_MODE=live");
  }
}

export async function upsertDesignReferencesForCapture(
  input: {
    captureRunId: string;
    references: DesignReferenceRecord[];
    platformProjectId?: string | null | undefined;
    digProjectId?: string | null | undefined;
  },
  client: Queryable | null = getPool()
): Promise<number> {
  if (!client) return 0;
  await runMigrations(process.cwd(), client);
  let count = 0;
  for (const ref of input.references) {
    const styleLabels = ref.tokens?.style_labels ?? ref.page_context?.visual_style_labels ?? [];
    const stamped: DesignReferenceRecord = {
      ...ref,
      ...(input.platformProjectId ? { platform_project_id: input.platformProjectId } : {}),
      ...(input.digProjectId ? { dig_project_id: input.digProjectId } : {})
    };
    await client.query(
      `INSERT INTO design_references (
        reference_id, capture_run_id, dig_project_id, platform_project_id,
        category, signature, look_summary, style_labels, payload, indexed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,NOW())
      ON CONFLICT (reference_id) DO UPDATE SET
        capture_run_id = EXCLUDED.capture_run_id,
        dig_project_id = COALESCE(EXCLUDED.dig_project_id, design_references.dig_project_id),
        platform_project_id = COALESCE(EXCLUDED.platform_project_id, design_references.platform_project_id),
        category = EXCLUDED.category,
        signature = EXCLUDED.signature,
        look_summary = EXCLUDED.look_summary,
        style_labels = EXCLUDED.style_labels,
        payload = EXCLUDED.payload,
        indexed_at = NOW()`,
      [
        ref.reference_id,
        input.captureRunId,
        input.digProjectId ?? null,
        input.platformProjectId ?? null,
        ref.taxonomy.category,
        ref.composition.signature,
        ref.look.look_summary,
        JSON.stringify(styleLabels),
        JSON.stringify(stamped)
      ]
    );
    count += 1;
  }
  try {
    const { upsertDesignReferenceEmbeddings } = await import("./design-reference-embeddings.js");
    await upsertDesignReferenceEmbeddings(client, input.captureRunId, input.references);
  } catch {
    /* vector extension may be unavailable */
  }
  if (input.digProjectId) {
    await client.query(
      `UPDATE dig_projects SET
        reference_count = (
          SELECT COUNT(*)::int FROM design_references WHERE dig_project_id = $1
        ),
        updated_at = NOW()
       WHERE id = $1`,
      [input.digProjectId]
    );
  }
  return count;
}

export async function indexDesignReferencesFromPackage(
  packageRoot: string,
  scope: { platformProjectId?: string | null | undefined; digProjectId?: string | null | undefined } = {},
  client: Queryable | null = getPool()
): Promise<number> {
  if (!client) return 0;
  let references: DesignReferenceRecord[] = [];
  let captureRunId = "";
  try {
    const raw = await readFile(resolve(packageRoot, DESIGN_REFERENCES_RELATIVE_PATH), "utf8");
    references = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as DesignReferenceRecord);
    captureRunId = references[0]?.capture_run_id ?? "";
  } catch {
    return 0;
  }
  if (!captureRunId || !references.length) return 0;
  return upsertDesignReferencesForCapture(
    {
      captureRunId,
      references,
      platformProjectId: scope.platformProjectId,
      digProjectId: scope.digProjectId
    },
    client
  );
}

function mapPayload(row: Record<string, unknown>): DesignReferenceRecord {
  return row.payload as DesignReferenceRecord;
}

export async function searchDesignReferences(
  query: DesignReferenceSearchQuery,
  client: Queryable | null = getPool()
): Promise<DesignReferenceRecord[]> {
  assertCollectionScopeAllowed(query.platformProjectId);
  if (!client) return [];
  await runMigrations(process.cwd(), client);

  const { captureRunIdsForScreenFacets } = await import("./library-screens.js");
  const captureRunIds = await captureRunIdsForScreenFacets(client, {
    style: query.style,
    layout: query.layout,
    industry: query.industry,
    platformProjectId: query.platformProjectId
  });
  if (captureRunIds && !captureRunIds.length) return [];

  if (query.similar_to?.trim()) {
    const { searchDesignReferenceEmbeddingNeighbors } = await import("./design-reference-embeddings.js");
    try {
      const neighbors = await searchDesignReferenceEmbeddingNeighbors(client, {
        similarTo: query.similar_to.trim(),
        category: query.category,
        signature: query.signature,
        style_label: query.style_label,
        captureRunIds: captureRunIds ?? undefined,
        platformProjectId: query.platformProjectId,
        digProjectId: query.digProjectId,
        limit: clampLimit(query.limit)
      });
      if (neighbors.length) {
        return neighbors.map((row) => row.payload);
      }
    } catch {
      /* fall through to lexical if vector unavailable */
    }
  }

  const clauses: string[] = [];
  const values: unknown[] = [];
  if (query.platformProjectId?.trim()) {
    values.push(query.platformProjectId.trim());
    clauses.push(`platform_project_id = $${values.length}`);
  }
  if (query.digProjectId?.trim()) {
    values.push(query.digProjectId.trim());
    clauses.push(`dig_project_id = $${values.length}`);
  }
  if (query.category?.trim()) {
    values.push(query.category.trim());
    clauses.push(`category = $${values.length}`);
  }
  if (query.signature?.trim()) {
    values.push(query.signature.trim());
    clauses.push(`signature = $${values.length}`);
  }
  if (query.style_label?.trim()) {
    values.push(JSON.stringify([query.style_label.trim()]));
    clauses.push(`style_labels @> $${values.length}::jsonb`);
  }
  if (captureRunIds) {
    values.push(captureRunIds);
    clauses.push(`capture_run_id = ANY($${values.length}::text[])`);
  }
  const textQuery = query.query?.trim() || query.similar_to?.trim();
  if (textQuery) {
    values.push(`%${textQuery.toLocaleLowerCase()}%`);
    clauses.push(
      `(LOWER(COALESCE(look_summary,'')) LIKE $${values.length} OR LOWER(COALESCE(signature,'')) LIKE $${values.length} OR LOWER(COALESCE(category,'')) LIKE $${values.length} OR LOWER(payload::text) LIKE $${values.length})`
    );
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = clampLimit(query.limit);
  values.push(limit);
  const result = await client.query(
    `SELECT payload FROM design_references
     ${where}
     ORDER BY indexed_at DESC
     LIMIT $${values.length}`,
    values
  );
  return (result.rows as Array<Record<string, unknown>>).map(mapPayload);
}

export async function getDesignReference(
  referenceId: string,
  opts: { platformProjectId?: string | null | undefined } = {},
  client: Queryable | null = getPool()
): Promise<DesignReferenceRecord | null> {
  assertCollectionScopeAllowed(opts.platformProjectId);
  if (!client) return null;
  await runMigrations(process.cwd(), client);
  const values: unknown[] = [referenceId.trim()];
  let sql = `SELECT payload FROM design_references WHERE reference_id = $1`;
  if (opts.platformProjectId?.trim()) {
    values.push(opts.platformProjectId.trim());
    sql += ` AND platform_project_id = $2`;
  }
  sql += ` LIMIT 1`;
  const result = await client.query(sql, values);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapPayload(row) : null;
}

export async function listDesignReferencesForCapture(
  captureRunId: string,
  opts: { platformProjectId?: string | null | undefined; limit?: number | undefined } = {},
  client: Queryable | null = getPool()
): Promise<DesignReferenceRecord[]> {
  if (!client) return [];
  const id = captureRunId.trim();
  if (!id) return [];
  await runMigrations(process.cwd(), client);
  const values: unknown[] = [id];
  let sql = `SELECT payload FROM design_references WHERE capture_run_id = $1`;
  if (opts.platformProjectId?.trim()) {
    values.push(opts.platformProjectId.trim());
    sql += ` AND platform_project_id = $${values.length}`;
  }
  values.push(clampLimit(opts.limit ?? 8));
  sql += ` ORDER BY CASE WHEN payload->>'scope' = 'screen' THEN 0 ELSE 1 END, indexed_at DESC LIMIT $${values.length}`;
  const result = await client.query(sql, values);
  return (result.rows as Array<Record<string, unknown>>).map(mapPayload);
}

export async function assembleDesignReferencePack(
  input: DesignReferencePackInput,
  client: Queryable | null = getPool()
): Promise<DesignReferencePack> {
  assertCollectionScopeAllowed(input.platformProjectId);
  const intent = input.intent.trim();
  if (!intent) throw new Error("intent required");
  const ids = [...new Set(input.reference_ids.map((id) => id.trim()).filter(Boolean))].slice(0, 8);
  if (!ids.length) throw new Error("reference_ids required");
  const references: DesignReferenceRecord[] = [];
  for (const id of ids) {
    const ref = await getDesignReference(id, { platformProjectId: input.platformProjectId }, client);
    if (!ref) throw new Error(`Unknown reference_id: ${id}`);
    references.push(ref);
  }
  return {
    schema_version: "0.1.0",
    intent,
    references,
    synthesis_mode: input.synthesis_mode === "look_conditioned" ? "look_conditioned" : "structural",
    constraints: { forbid_source_copy: true }
  };
}
