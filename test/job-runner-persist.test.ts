import assert from "node:assert/strict";
import test from "node:test";
import { JobRunner } from "../src/job-runner.js";
import type { JobRecord } from "../src/job-runner.js";

test("JobRunner restoreFromPersistence rebuilds pending FIFO and calls persist", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const persisted: Array<{ jobId: string; queueIndex: number | null }> = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const runner = new JobRunner({
    maxConcurrent: 1,
    asyncEnrichment: false,
    persist: async (job, queueIndex) => {
      persisted.push({ jobId: job.job_id, queueIndex });
      return true;
    },
    captureFn: async (options) => {
      if (options.url.includes("first.example")) await gate;
      return {
        packageRoot: "/tmp/pkg",
        manifest: {
          status: "complete",
          capture_run_id: "cap_restore",
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    verifyFn: async () => ({
      valid: true,
      package_root: "/tmp/pkg",
      capture_run_id: "cap_restore",
      checked_artifacts: 1,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: "/tmp/idx",
      graph: { nodes: [], edges: [] } as never
    })
  });

  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  try {
  const jobs: JobRecord[] = [
    {
      job_id: "job_first",
      url: "https://first.example/",
      stage: "queued",
      message: "queued",
      created_at: "2026-08-19T20:00:01.000Z",
      updated_at: "2026-08-19T20:00:01.000Z",
      events: []
    },
    {
      job_id: "job_second",
      url: "https://second.example/",
      stage: "queued",
      message: "queued",
      created_at: "2026-08-19T20:00:02.000Z",
      updated_at: "2026-08-19T20:00:02.000Z",
      events: []
    }
  ];
  runner.restoreFromPersistence(jobs, ["job_first", "job_second"]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  assert.deepEqual(runner.queuedOrder(), ["job_second"]);
  assert.equal(runner.getJob("job_first")?.stage, "capturing");

  release();
  await Promise.all(
    ["job_first", "job_second"].map(
      (jobId) =>
        new Promise<void>((resolveDone, reject) => {
          const current = runner.getJob(jobId);
          if (current?.stage === "complete") {
            resolveDone();
            return;
          }
          const stop = runner.subscribe(jobId, (event) => {
            if (event.stage === "complete" || event.stage === "failed") {
              stop();
              if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
              else resolveDone();
            }
          });
        })
    )
  );

  const created = runner.startJob("https://third.example/");
  assert.ok(persisted.some((entry) => entry.jobId === created.job_id));
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});
