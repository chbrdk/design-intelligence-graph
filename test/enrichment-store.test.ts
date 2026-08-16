import assert from "node:assert/strict";
import test from "node:test";
import { claimNextEnrichmentJob, persistEnrichmentJob } from "../src/enrichment-store.js";
import type { EnrichmentJobRecord } from "../src/enrichment-queue.js";

test("persistEnrichmentJob and claimNextEnrichmentJob use SQL against injectable client", async () => {
  const rows: Array<Record<string, unknown>> = [];
  const queries: string[] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      queries.push(sql.replace(/\s+/g, " ").trim());
      if (/FOR UPDATE SKIP LOCKED/i.test(sql)) {
        const queued = rows.find((row) => row.status === "queued");
        const staleRunning = rows.find(
          (row) =>
            row.status === "running" &&
            typeof row.updated_at === "string" &&
            new Date(String(row.updated_at)).getTime() < Date.now() - 60_000
        );
        const pick = queued ?? staleRunning;
        return { rows: pick ? [pick] : [] };
      }
      if (/INSERT INTO enrichment_jobs/i.test(sql)) {
        const job = {
          enrichment_job_id: values?.[0],
          capture_run_id: values?.[1],
          package_path: values?.[2],
          status: values?.[3],
          attempts: values?.[4],
          max_attempts: values?.[5],
          created_at: values?.[12],
          updated_at: values?.[13]
        };
        const existing = rows.findIndex((row) => row.enrichment_job_id === job.enrichment_job_id);
        if (existing >= 0) rows[existing] = { ...rows[existing], ...job };
        else rows.push(job);
        return { rows: [] };
      }
      if (/UPDATE enrichment_jobs/i.test(sql)) {
        const id = values?.[0];
        const row = rows.find((item) => item.enrichment_job_id === id);
        if (row) {
          row.status = "running";
          row.attempts = Number(row.attempts ?? 0) + 1;
          row.updated_at = values?.[1];
          row.started_at = row.started_at ?? values?.[1];
        }
        return { rows: [] };
      }
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql.trim())) return { rows: [] };
      return { rows: [] };
    }
  };

  const job: EnrichmentJobRecord = {
    enrichment_job_id: "enr_test",
    capture_run_id: "cap_1",
    package_path: "/tmp/pkg",
    status: "queued",
    message: "queued",
    attempts: 0,
    max_attempts: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  assert.equal(await persistEnrichmentJob(job, client), true);
  const claimed = await claimNextEnrichmentJob(client);
  assert.ok(claimed);
  assert.equal(claimed.enrichment_job_id, "enr_test");
  assert.equal(claimed.status, "running");
  assert.ok(queries.some((sql) => /SKIP LOCKED/i.test(sql)));
  assert.ok(queries.some((sql) => /status = 'running' AND updated_at </i.test(sql)));
});

test("claimNextEnrichmentJob reclaims stale running rows", async () => {
  const client = {
    async query(sql: string, params?: unknown[]) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
        return { rows: [] };
      }
      if (normalized.startsWith("SELECT * FROM enrichment_jobs")) {
        assert.ok(String(params?.[0] ?? "").length > 0, "expects staleBefore timestamp");
        assert.match(normalized, /status = 'running' AND updated_at </);
        return {
          rows: [
            {
              enrichment_job_id: "enr_stale",
              capture_run_id: "cap_x",
              package_path: "/data/captures/x",
              status: "running",
              attempts: 1,
              max_attempts: 3,
              created_at: "2026-08-16T18:00:00.000Z",
              updated_at: "2026-08-16T18:00:01.000Z",
              started_at: "2026-08-16T18:00:01.000Z"
            }
          ]
        };
      }
      if (normalized.startsWith("UPDATE enrichment_jobs")) {
        assert.equal(params?.[2], true, "wasStale flag");
        return { rows: [] };
      }
      throw new Error(`unexpected sql: ${normalized}`);
    }
  };

  const claimed = await claimNextEnrichmentJob(client as never, { staleAfterMs: 60_000 });
  assert.ok(claimed);
  assert.equal(claimed.enrichment_job_id, "enr_stale");
  assert.equal(claimed.status, "running");
  assert.equal(claimed.attempts, 2);
  assert.match(claimed.message, /Reclaimed stale/);
});
