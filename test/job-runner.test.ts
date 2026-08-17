import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createJobId,
  formatJobIssueList,
  isDetectionStage,
  isIngestionStage,
  JobRunner,
  normalizeCaptureUrl,
  publicJobView
} from "../src/job-runner.js";

test("formatJobIssueList caps duplicate ontology ids in job.error", () => {
  const issues = Array.from({ length: 20 }, (_, index) => ({
    code: "duplicate_ontology_entity_id",
    message: `ont_${index}`
  }));
  const text = formatJobIssueList(issues);
  assert.match(text, /^duplicate_ontology_entity_id:ont_0;/);
  assert.match(text, /\(\+12 more\)$/);
  assert.equal(text.includes("ont_19"), false);
});

test("JobRunner verify failure stores a capped error instead of hanging the UI", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-verify-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-verify-idx-"));
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    asyncEnrichment: false,
    captureFn: async () => ({
      packageRoot: join(capturesDir, "pkg"),
      manifest: {
        status: "partial",
        capture_run_id: "cap_verify_fail",
        errors: [],
        viewport_captures: [{ name: "desktop" }]
      } as never
    }),
    verifyFn: async () => ({
      valid: false,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_verify_fail",
      checked_artifacts: 4,
      issues: [
        { code: "duplicate_ontology_entity_id", path: "derived/ontology.json", message: "ont_aaa" },
        { code: "duplicate_ontology_entity_id", path: "derived/ontology.json", message: "ont_bbb" }
      ]
    }),
    indexFn: async () => {
      throw new Error("index must not run after verify failure");
    }
  });
  try {
    const job = runner.startJob("https://tesla.com/");
    await new Promise<void>((resolveDone, reject) => {
      const seen = runner.getJob(job.job_id)?.events.map((event) => event.stage) ?? [];
      if (seen.includes("failed")) {
        resolveDone();
        return;
      }
      if (seen.includes("complete")) {
        reject(new Error("expected verify failure"));
        return;
      }
      const stop = runner.subscribe(job.job_id, (event) => {
        if (event.stage === "complete" || event.stage === "failed") {
          stop();
          if (event.stage === "complete") reject(new Error("expected verify failure"));
          else resolveDone();
        }
      });
    });
    const view = publicJobView(runner.getJob(job.job_id)!);
    assert.equal(view.stage, "failed");
    assert.match(view.error ?? "", /duplicate_ontology_entity_id:ont_aaa/);
    assert.match(view.error ?? "", /ont_bbb/);
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});

test("normalizeCaptureUrl accepts http(s) and rejects other schemes", () => {
  assert.equal(normalizeCaptureUrl("example.com/path"), "https://example.com/path");
  assert.equal(normalizeCaptureUrl("http://localhost:4173/"), "http://localhost:4173/");
  assert.throws(() => normalizeCaptureUrl("ftp://example.com"), /http and https/);
  assert.throws(() => normalizeCaptureUrl(""), /required/);
});

test("stage helpers separate detection from ingestion", () => {
  assert.equal(isDetectionStage("capturing"), true);
  assert.equal(isIngestionStage("indexing"), true);
  assert.equal(isDetectionStage("verifying"), false);
  assert.ok(createJobId().startsWith("job_"));
});

test("JobRunner sync path emits capture → analyze → verify → index events with injectable pipeline", async () => {
  const previous = process.env.DIG_LLM_ENABLED;
  const previousAsync = process.env.DIG_LLM_ASYNC;
  process.env.DIG_LLM_ENABLED = "true";
  process.env.DIG_LLM_ASYNC = "false";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-cap-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-idx-"));
  const events: string[] = [];
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    asyncEnrichment: false,
    captureFn: async () => ({
      packageRoot: join(capturesDir, "pkg"),
      manifest: {
        status: "complete",
        capture_run_id: "cap_test",
        errors: [],
        viewport_captures: [{ name: "mobile" }, { name: "tablet" }, { name: "desktop" }]
      } as never
    }),
    analyzeFn: async () => ({
      updated: true,
      analysis: {} as never,
      llm: {
        schema_version: "0.1.0",
        llm_design_version: "0.1.0",
        generated_at: new Date().toISOString(),
        model: "gemma4",
        base_url: "http://127.0.0.1:11434/v1",
        status: "complete",
        design_summary: "Restrained content page",
        hypotheses: [{ hypothesis_id: "ldh_1" }]
      } as never
    }),
    verifyFn: async () => ({
      valid: true,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_test",
      checked_artifacts: 12,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: join(indexesDir, "cap_test"),
      graph: { nodes: [{ node_id: "n1" }], edges: [{ edge_id: "e1" }] } as never
    })
  });

  try {
    const job = runner.startJob("https://example.com");
    await new Promise<void>((resolveDone, reject) => {
      const seen = runner.getJob(job.job_id)?.events.map((event) => event.stage) ?? [];
      events.push(...seen);
      if (seen.includes("complete") || seen.includes("failed")) {
        if (seen.includes("failed")) reject(new Error("failed before subscribe"));
        else resolveDone();
        return;
      }
      const stop = runner.subscribe(job.job_id, (event) => {
        events.push(event.stage);
        if (event.stage === "complete" || event.stage === "failed") {
          stop();
          if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
          else resolveDone();
        }
      });
    });
    assert.deepEqual(
      events.filter((stage, index) => events[index - 1] !== stage),
      ["queued", "capturing", "analyzing", "verifying", "indexing", "complete"]
    );
    const view = publicJobView(runner.getJob(job.job_id)!);
    assert.equal(view.result?.nodes, 1);
    assert.equal(view.result?.llm_hypothesis_count, 1);
    assert.equal(view.result?.design_summary, "Restrained content page");
  } finally {
    if (previous === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previous;
    if (previousAsync === undefined) delete process.env.DIG_LLM_ASYNC;
    else process.env.DIG_LLM_ASYNC = previousAsync;
  }
});

test("JobRunner async path completes without waiting on enrichment analyzeFn", async () => {
  const previous = process.env.DIG_LLM_ENABLED;
  process.env.DIG_LLM_ENABLED = "true";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-async-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-async-idx-"));
  const { EnrichmentQueue } = await import("../src/enrichment-queue.js");
  const queue = new EnrichmentQueue({ autoStart: false });
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    asyncEnrichment: true,
    enrichmentQueue: queue,
    captureFn: async () => ({
      packageRoot: join(capturesDir, "pkg"),
      manifest: {
        status: "complete",
        capture_run_id: "cap_async",
        errors: [],
        viewport_captures: [{ name: "desktop" }]
      } as never
    }),
    analyzeFn: async () => {
      throw new Error("sync analyze must not run in async mode");
    },
    verifyFn: async () => ({
      valid: true,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_async",
      checked_artifacts: 3,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: join(indexesDir, "cap_async"),
      graph: { nodes: [], edges: [] } as never
    })
  });
  try {
    const job = runner.startJob("https://example.com/async");
    await new Promise<void>((resolveDone, reject) => {
      const stop = runner.subscribe(job.job_id, (event) => {
        if (event.stage === "complete" || event.stage === "failed") {
          stop();
          if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
          else resolveDone();
        }
      });
    });
    const view = publicJobView(runner.getJob(job.job_id)!);
    assert.equal(view.result?.llm_status, "queued");
    assert.ok(view.result?.enrichment_job_id);
    const enrichment = queue.getJob(view.result!.enrichment_job_id!);
    assert.ok(enrichment);
    assert.equal(enrichment.status, "queued");
  } finally {
    queue.stop();
    if (previous === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previous;
  }
});
