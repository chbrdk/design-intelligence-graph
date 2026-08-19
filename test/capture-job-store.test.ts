import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCaptureJobHydration,
  persistCaptureJob,
  recoverJobForRestart,
  trimEventsForPersist
} from "../src/capture-job-store.js";
import type { JobRecord } from "../src/job-runner.js";

test("persistCaptureJob upserts capture_jobs rows", async () => {
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      if (/INSERT INTO capture_jobs/i.test(sql)) {
        rows.push({
          job_id: values?.[0],
          url: values?.[1],
          stage: values?.[3],
          queue_position: values?.[5],
          events: values?.[12]
        });
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const job: JobRecord = {
    job_id: "job_test",
    url: "https://example.com/",
    stage: "queued",
    message: "queued",
    created_at: "2026-08-19T20:00:00.000Z",
    updated_at: "2026-08-19T20:00:00.000Z",
    events: []
  };
  assert.equal(await persistCaptureJob(job, 2, client), true);
  assert.equal(rows[0]?.queue_position, 2);
});

test("recoverJobForRestart requeues in-flight jobs and fails stale uploads", () => {
  const inFlight: JobRecord = {
    job_id: "job_a",
    url: "https://example.com/",
    stage: "capturing",
    message: "running",
    created_at: "2026-08-19T20:00:00.000Z",
    updated_at: "2026-08-19T20:00:00.000Z",
    events: []
  };
  const recovered = recoverJobForRestart(inFlight);
  assert.equal(recovered.stage, "queued");
  assert.match(recovered.message, /Recovered after API restart/);

  const upload: JobRecord = {
    job_id: "job_b",
    url: "dig-upload://missing",
    stage: "queued",
    message: "queued",
    created_at: "2026-08-19T20:00:00.000Z",
    updated_at: "2026-08-19T20:00:00.000Z",
    events: [],
    ingest_source: "upload",
    upload_image: { source_id: "up_1", filename: "a.png", path: "/tmp/does-not-exist.png" }
  };
  const failed = recoverJobForRestart(upload);
  assert.equal(failed.stage, "failed");
  assert.equal(failed.error, "upload_temp_missing");
});

test("buildCaptureJobHydration preserves queue order from queue_position", async () => {
  const client = {
    async query() {
      return {
        rows: [
          {
            job_id: "job_later",
            url: "https://later.example/",
            stage: "queued",
            message: "queued",
            queue_position: 1,
            events: "[]",
            created_at: "2026-08-19T20:00:02.000Z",
            updated_at: "2026-08-19T20:00:02.000Z"
          },
          {
            job_id: "job_first",
            url: "https://first.example/",
            stage: "queued",
            message: "queued",
            queue_position: 0,
            events: "[]",
            created_at: "2026-08-19T20:00:01.000Z",
            updated_at: "2026-08-19T20:00:01.000Z"
          },
          {
            job_id: "job_running",
            url: "https://running.example/",
            stage: "capturing",
            message: "running",
            queue_position: null,
            events: "[]",
            created_at: "2026-08-19T20:00:00.000Z",
            updated_at: "2026-08-19T20:00:00.000Z"
          }
        ]
      };
    }
  };

  const { jobs, pendingOrder } = await buildCaptureJobHydration(client);
  assert.equal(jobs.length, 3);
  assert.deepEqual(pendingOrder, ["job_running", "job_first", "job_later"]);
  assert.equal(jobs.find((job) => job.job_id === "job_running")?.stage, "queued");
});

test("trimEventsForPersist keeps the latest events only", () => {
  const events = Array.from({ length: 60 }, (_, index) => ({
    job_id: "job_x",
    stage: "capturing" as const,
    message: `event ${index}`,
    at: `2026-08-19T20:00:${String(index).padStart(2, "0")}.000Z`
  }));
  const trimmed = trimEventsForPersist(events);
  assert.equal(trimmed.length, 48);
  assert.equal(trimmed[0]?.message, "event 12");
});
