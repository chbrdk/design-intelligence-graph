import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import type { EnrichmentJobRecord, EnrichmentStatus } from "./enrichment-queue.js";

function rowToJob(row: Record<string, unknown>): EnrichmentJobRecord {
  const job: EnrichmentJobRecord = {
    enrichment_job_id: String(row.enrichment_job_id),
    capture_run_id: String(row.capture_run_id),
    package_path: String(row.package_path),
    status: row.status as EnrichmentStatus,
    message: String(row.status),
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString()
  };
  if (row.capture_job_id) job.capture_job_id = String(row.capture_job_id);
  if (row.bulk_model) job.bulk_model = String(row.bulk_model);
  if (row.quality_model) job.quality_model = String(row.quality_model);
  if (row.started_at) job.started_at = new Date(String(row.started_at)).toISOString();
  if (row.completed_at) job.completed_at = new Date(String(row.completed_at)).toISOString();
  if (row.error) job.error = String(row.error);
  if (row.llm_status) job.llm_status = String(row.llm_status);
  if (row.hypothesis_count !== null && row.hypothesis_count !== undefined) {
    job.hypothesis_count = Number(row.hypothesis_count);
  }
  if (row.design_summary) job.design_summary = String(row.design_summary);
  if (row.vision_status) job.vision_status = String(row.vision_status);
  if (row.prompt_tokens !== null && row.prompt_tokens !== undefined) job.prompt_tokens = Number(row.prompt_tokens);
  if (row.completion_tokens !== null && row.completion_tokens !== undefined) {
    job.completion_tokens = Number(row.completion_tokens);
  }
  if (row.estimated_usd !== null && row.estimated_usd !== undefined) {
    job.estimated_usd = Number(row.estimated_usd);
  }
  return job;
}

export async function persistEnrichmentJob(
  job: EnrichmentJobRecord,
  client: Queryable | null = getPool()
): Promise<boolean> {
  if (!client) return false;
  await client.query(
    `INSERT INTO enrichment_jobs (
      enrichment_job_id, capture_run_id, package_path, status, attempts, max_attempts,
      bulk_model, quality_model, error, llm_status, hypothesis_count, design_summary,
      created_at, updated_at, started_at, completed_at,
      prompt_tokens, completion_tokens, estimated_usd, vision_status
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )
    ON CONFLICT (enrichment_job_id) DO UPDATE SET
      status = EXCLUDED.status,
      attempts = EXCLUDED.attempts,
      error = EXCLUDED.error,
      llm_status = EXCLUDED.llm_status,
      hypothesis_count = EXCLUDED.hypothesis_count,
      design_summary = EXCLUDED.design_summary,
      updated_at = EXCLUDED.updated_at,
      started_at = EXCLUDED.started_at,
      completed_at = EXCLUDED.completed_at,
      prompt_tokens = EXCLUDED.prompt_tokens,
      completion_tokens = EXCLUDED.completion_tokens,
      estimated_usd = EXCLUDED.estimated_usd,
      vision_status = EXCLUDED.vision_status`,
    [
      job.enrichment_job_id,
      job.capture_run_id,
      job.package_path,
      job.status,
      job.attempts,
      job.max_attempts,
      job.bulk_model ?? null,
      job.quality_model ?? null,
      job.error ?? null,
      job.llm_status ?? null,
      job.hypothesis_count ?? null,
      job.design_summary ?? null,
      job.created_at,
      job.updated_at,
      job.started_at ?? null,
      job.completed_at ?? null,
      job.prompt_tokens ?? null,
      job.completion_tokens ?? null,
      job.estimated_usd ?? null,
      job.vision_status ?? null
    ]
  );
  return true;
}

/** Claim next queued job for a worker (Postgres). Returns null when DB empty/unavailable. */
export async function claimNextEnrichmentJob(
  client: Queryable | null = getPool()
): Promise<EnrichmentJobRecord | null> {
  if (!client) return null;
  await client.query("BEGIN");
  try {
    const result = await client.query(
      `SELECT * FROM enrichment_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("COMMIT");
      return null;
    }
    const now = new Date().toISOString();
    await client.query(
      `UPDATE enrichment_jobs
       SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, $2::timestamptz), updated_at = $2::timestamptz
       WHERE enrichment_job_id = $1`,
      [row.enrichment_job_id, now]
    );
    await client.query("COMMIT");
    const claimed = rowToJob({ ...row, status: "running", started_at: row.started_at ?? now, updated_at: now });
    claimed.attempts = Number(row.attempts ?? 0) + 1;
    claimed.message = "Running staged LLM enrichment";
    return claimed;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function listEnrichmentJobsFromDb(
  limit = 50,
  client: Queryable | null = getPool()
): Promise<EnrichmentJobRecord[]> {
  if (!client) return [];
  const result = await client.query(
    `SELECT * FROM enrichment_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(rowToJob);
}

export async function getEnrichmentJobFromDb(
  enrichmentJobId: string,
  client: Queryable | null = getPool()
): Promise<EnrichmentJobRecord | null> {
  if (!client) return null;
  const result = await client.query(`SELECT * FROM enrichment_jobs WHERE enrichment_job_id = $1 LIMIT 1`, [
    enrichmentJobId
  ]);
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}
