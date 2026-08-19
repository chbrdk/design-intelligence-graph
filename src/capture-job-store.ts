import { existsSync } from "node:fs";
import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import type { JobEvent, JobRecord, JobResult, JobStage } from "./job-runner.js";
import type { PinterestPinIngest } from "./job-runner.js";
import type { UploadedImageIngest } from "./image-ingest.js";

const IN_FLIGHT_STAGES = new Set<JobStage>(["capturing", "analyzing", "verifying", "indexing"]);
const MAX_PERSISTED_EVENTS = 48;

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  const events = parseJson<JobEvent[]>(row.events) ?? [];
  const job: JobRecord = {
    job_id: String(row.job_id),
    url: String(row.url),
    stage: row.stage as JobStage,
    message: String(row.message ?? ""),
    created_at: new Date(String(row.created_at)).toISOString(),
    updated_at: new Date(String(row.updated_at)).toISOString(),
    events
  };
  if (row.error) job.error = String(row.error);
  if (row.platform_project_id) job.platform_project_id = String(row.platform_project_id);
  if (row.dig_project_id) job.dig_project_id = String(row.dig_project_id);
  if (row.ingest_source) job.ingest_source = row.ingest_source as JobRecord["ingest_source"];
  const pinterest = parseJson<PinterestPinIngest>(row.pinterest_pin);
  if (pinterest) job.pinterest_pin = pinterest;
  const upload = parseJson<UploadedImageIngest>(row.upload_image);
  if (upload) job.upload_image = upload;
  const result = parseJson<JobResult>(row.result);
  if (result) job.result = result;
  return job;
}

export function trimEventsForPersist(events: JobEvent[]): JobEvent[] {
  if (events.length <= MAX_PERSISTED_EVENTS) return events;
  return events.slice(-MAX_PERSISTED_EVENTS);
}

export async function persistCaptureJob(
  job: JobRecord,
  queueIndex: number | null = null,
  client: Queryable | null = getPool()
): Promise<boolean> {
  if (!client) return false;
  const queuePosition = job.stage === "queued" && queueIndex !== null ? queueIndex : null;
  await client.query(
    `INSERT INTO capture_jobs (
      job_id, url, stage, message, error, queue_position,
      platform_project_id, dig_project_id, ingest_source,
      pinterest_pin, upload_image, result, events, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::timestamptz,$15::timestamptz
    )
    ON CONFLICT (job_id) DO UPDATE SET
      stage = EXCLUDED.stage,
      message = EXCLUDED.message,
      error = EXCLUDED.error,
      queue_position = EXCLUDED.queue_position,
      result = EXCLUDED.result,
      events = EXCLUDED.events,
      updated_at = EXCLUDED.updated_at`,
    [
      job.job_id,
      job.url,
      job.stage,
      job.message,
      job.error ?? null,
      queuePosition,
      job.platform_project_id ?? null,
      job.dig_project_id ?? null,
      job.ingest_source ?? null,
      job.pinterest_pin ? JSON.stringify(job.pinterest_pin) : null,
      job.upload_image ? JSON.stringify(job.upload_image) : null,
      job.result ? JSON.stringify(job.result) : null,
      JSON.stringify(trimEventsForPersist(job.events)),
      job.created_at,
      job.updated_at
    ]
  );
  return true;
}

export async function listCaptureJobsForHydration(
  options: { terminalHours?: number; limit?: number } = {},
  client: Queryable | null = getPool()
): Promise<JobRecord[]> {
  if (!client) return [];
  const terminalHours = options.terminalHours ?? 72;
  const limit = options.limit ?? 2000;
  const result = await client.query(
    `SELECT * FROM capture_jobs
     WHERE stage NOT IN ('complete', 'failed', 'skipped')
        OR updated_at >= NOW() - ($1::text || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [String(terminalHours), limit]
  );
  return result.rows.map(rowToJob);
}

export async function listActiveCaptureUrlKeys(client: Queryable | null = getPool()): Promise<string[]> {
  if (!client) return [];
  const result = await client.query(
    `SELECT url FROM capture_jobs
     WHERE stage IN ('queued', 'capturing', 'analyzing', 'verifying', 'indexing')`
  );
  return result.rows.map((row) => String(row.url));
}

export function recoverJobForRestart(job: JobRecord): JobRecord {
  const recovered = { ...job, events: [...job.events] };
  if (IN_FLIGHT_STAGES.has(recovered.stage)) {
    recovered.stage = "queued";
    recovered.message = "Recovered after API restart";
    recovered.updated_at = new Date().toISOString();
  }
  if (recovered.ingest_source === "upload" && recovered.upload_image?.path) {
    if (!existsSync(recovered.upload_image.path)) {
      recovered.stage = "failed";
      recovered.message = "Upload temp file missing after restart";
      recovered.error = "upload_temp_missing";
      recovered.updated_at = new Date().toISOString();
    }
  }
  return recovered;
}

export async function buildCaptureJobHydration(
  client: Queryable | null = getPool()
): Promise<{ jobs: JobRecord[]; pendingOrder: string[] }> {
  if (!client) return { jobs: [], pendingOrder: [] };
  const terminalHours = 72;
  const limit = 2000;
  const result = await client.query(
    `SELECT * FROM capture_jobs
     WHERE stage NOT IN ('complete', 'failed', 'skipped')
        OR updated_at >= NOW() - ($1::text || ' hours')::interval
     ORDER BY created_at ASC
     LIMIT $2`,
    [String(terminalHours), limit]
  );
  const jobs = result.rows.map((row) => recoverJobForRestart(rowToJob(row)));
  const recoveredInflight: string[] = [];
  const queuedByPosition: Array<{ jobId: string; queuePosition: number; createdAt: string }> = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows[index]!;
    const job = jobs[index]!;
    const originalStage = String(row.stage) as JobStage;
    if (IN_FLIGHT_STAGES.has(originalStage) && job.stage === "queued") {
      recoveredInflight.push(job.job_id);
      continue;
    }
    if (originalStage === "queued" && job.stage === "queued") {
      queuedByPosition.push({
        jobId: job.job_id,
        queuePosition:
          row.queue_position === null || row.queue_position === undefined
            ? Number.MAX_SAFE_INTEGER
            : Number(row.queue_position),
        createdAt: String(row.created_at)
      });
    }
  }
  queuedByPosition.sort((left, right) => {
    if (left.queuePosition !== right.queuePosition) return left.queuePosition - right.queuePosition;
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  });
  const pendingOrder = [...recoveredInflight, ...queuedByPosition.map((entry) => entry.jobId)];
  return { jobs, pendingOrder };
}
