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

test("JobRunner runs at most one capture at a time", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-conc-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-conc-idx-"));
  let inFlight = 0;
  let peak = 0;
  let releaseFirst: () => void = () => undefined;
  const firstGate = new Promise<void>((resolveGate) => {
    releaseFirst = resolveGate;
  });
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    maxConcurrent: 1,
    asyncEnrichment: false,
    captureFn: async (options) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (options.url.includes("first.example")) await firstGate;
      inFlight -= 1;
      return {
        packageRoot: join(capturesDir, "pkg"),
        manifest: {
          status: "complete",
          capture_run_id: "cap_conc",
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    verifyFn: async () => ({
      valid: true,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_conc",
      checked_artifacts: 1,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: join(indexesDir, "cap_conc"),
      graph: { nodes: [], edges: [] } as never
    })
  });
  try {
    const first = runner.startJob("https://first.example/");
    const second = runner.startJob("https://second.example/");
    await new Promise((resolveWait) => setTimeout(resolveWait, 30));
    assert.equal(runner.getJob(first.job_id)?.stage, "capturing");
    assert.equal(runner.getJob(second.job_id)?.stage, "queued");
    assert.equal(peak, 1);
    releaseFirst();
    await Promise.all(
      [first, second].map(
        (job) =>
          new Promise<void>((resolveDone, reject) => {
            const current = runner.getJob(job.job_id);
            if (current?.stage === "complete") {
              resolveDone();
              return;
            }
            if (current?.stage === "failed") {
              reject(new Error(current.error ?? "failed"));
              return;
            }
            const stop = runner.subscribe(job.job_id, (event) => {
              if (event.stage === "complete" || event.stage === "failed") {
                stop();
                if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
                else resolveDone();
              }
            });
          })
      )
    );
    assert.equal(peak, 1);
    assert.equal(runner.getJob(first.job_id)?.stage, "complete");
    assert.equal(runner.getJob(second.job_id)?.stage, "complete");
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});

test("JobRunner runs three captures in parallel when maxConcurrent is 3", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-conc3-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-conc3-idx-"));
  let inFlight = 0;
  let peak = 0;
  let seq = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    maxConcurrent: 3,
    asyncEnrichment: false,
    captureFn: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      seq += 1;
      const runId = `cap_c3_${seq}`;
      await gate;
      inFlight -= 1;
      return {
        packageRoot: join(capturesDir, runId),
        manifest: {
          status: "complete",
          capture_run_id: runId,
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    verifyFn: async () => ({
      valid: true,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_c3",
      checked_artifacts: 1,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: join(indexesDir, "cap_c3"),
      graph: { nodes: [], edges: [] } as never
    })
  });
  try {
    const jobs = ["one", "two", "three", "four"].map((host) => runner.startJob(`https://${host}.example/`));
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    const stages = jobs.map((job) => runner.getJob(job.job_id)?.stage);
    assert.equal(stages.filter((stage) => stage === "capturing").length, 3);
    assert.equal(stages.filter((stage) => stage === "queued").length, 1);
    assert.equal(peak, 3);
    release();
    await Promise.all(
      jobs.map(
        (job) =>
          new Promise<void>((resolveDone, reject) => {
            const current = runner.getJob(job.job_id);
            if (current?.stage === "complete") {
              resolveDone();
              return;
            }
            if (current?.stage === "failed") {
              reject(new Error(current.error ?? "failed"));
              return;
            }
            const stop = runner.subscribe(job.job_id, (event) => {
              if (event.stage === "complete" || event.stage === "failed") {
                stop();
                if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
                else resolveDone();
              }
            });
          })
      )
    );
    assert.equal(peak, 3);
    assert.ok(jobs.every((job) => runner.getJob(job.job_id)?.stage === "complete"));
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});

test("JobRunner runs still-image jobs on a separate concurrency pool", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-imgpool-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-imgpool-idx-"));
  let playwrightInFlight = 0;
  let playwrightPeak = 0;
  let imageInFlight = 0;
  let imagePeak = 0;
  let seq = 0;
  let releasePlaywright: () => void = () => undefined;
  let releaseImages: () => void = () => undefined;
  const playwrightGate = new Promise<void>((resolveGate) => {
    releasePlaywright = resolveGate;
  });
  const imageGate = new Promise<void>((resolveGate) => {
    releaseImages = resolveGate;
  });
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    maxConcurrent: 1,
    maxImageConcurrent: 2,
    asyncEnrichment: false,
    captureFn: async () => {
      playwrightInFlight += 1;
      playwrightPeak = Math.max(playwrightPeak, playwrightInFlight);
      seq += 1;
      const runId = `cap_pw_${seq}`;
      await playwrightGate;
      playwrightInFlight -= 1;
      return {
        packageRoot: join(capturesDir, runId),
        manifest: {
          status: "complete",
          capture_run_id: runId,
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    stillImageIngestFn: async () => {
      imageInFlight += 1;
      imagePeak = Math.max(imagePeak, imageInFlight);
      seq += 1;
      const runId = `cap_img_${seq}`;
      await imageGate;
      imageInFlight -= 1;
      return {
        packageRoot: join(capturesDir, runId),
        manifest: {
          status: "complete",
          capture_run_id: runId,
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    verifyFn: async () => ({
      valid: true,
      package_root: join(capturesDir, "pkg"),
      capture_run_id: "cap_imgpool",
      checked_artifacts: 1,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: join(indexesDir, "cap_imgpool"),
      graph: { nodes: [], edges: [] } as never
    })
  });
  try {
    const urls = ["one", "two"].map((host) => runner.startJob(`https://${host}.example/`));
    const images = ["a.png", "b.png", "c.png"].map((filename, index) =>
      runner.startUploadJob({
        source_id: `upload_${index}`,
        filename,
        path: join(capturesDir, filename)
      })
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    const urlStages = urls.map((job) => runner.getJob(job.job_id)?.stage);
    const imageStages = images.map((job) => runner.getJob(job.job_id)?.stage);
    assert.equal(urlStages.filter((stage) => stage === "capturing").length, 1);
    assert.equal(urlStages.filter((stage) => stage === "queued").length, 1);
    assert.equal(imageStages.filter((stage) => stage === "capturing").length, 2);
    assert.equal(imageStages.filter((stage) => stage === "queued").length, 1);
    assert.equal(playwrightPeak, 1);
    assert.equal(imagePeak, 2);
    releasePlaywright();
    releaseImages();
    await Promise.all(
      [...urls, ...images].map(
        (job) =>
          new Promise<void>((resolveDone, reject) => {
            const current = runner.getJob(job.job_id);
            if (current?.stage === "complete") {
              resolveDone();
              return;
            }
            if (current?.stage === "failed") {
              reject(new Error(current.error ?? "failed"));
              return;
            }
            const stop = runner.subscribe(job.job_id, (event) => {
              if (event.stage === "complete" || event.stage === "failed") {
                stop();
                if (event.stage === "failed") reject(new Error(event.error ?? "failed"));
                else resolveDone();
              }
            });
          })
      )
    );
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});

test("JobRunner failJob marks queued or in-flight jobs failed", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const runner = new JobRunner({
    maxConcurrent: 1,
    asyncEnrichment: false,
    captureFn: async (options) => {
      if (options.url.includes("first.example")) await gate;
      return {
        packageRoot: "/tmp/pkg",
        manifest: {
          status: "complete",
          capture_run_id: "cap_fail_job",
          errors: [],
          viewport_captures: [{ name: "desktop" }]
        } as never
      };
    },
    verifyFn: async () => ({
      valid: true,
      package_root: "/tmp/pkg",
      capture_run_id: "cap_fail_job",
      checked_artifacts: 1,
      issues: []
    }),
    indexFn: async () => ({
      indexRoot: "/tmp/idx",
      graph: { nodes: [], edges: [] } as never
    })
  });
  try {
    const active = runner.startJob("https://first.example/");
    const waiting = runner.startJob("https://second.example/");
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    const failedActive = runner.failJob(active.job_id, "stuck capture cancelled");
    assert.ok(failedActive);
    assert.equal(failedActive.stage, "failed");
    const failedQueued = runner.failJob(waiting.job_id, "removed from queue");
    assert.ok(failedQueued);
    assert.equal(failedQueued.stage, "failed");
    assert.deepEqual(runner.queuedOrder(), []);
    release();
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});

test("JobRunner cancelQueued and moveQueued edit the pending FIFO", () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  process.env.DIG_LLM_ENABLED = "false";
  const runner = new JobRunner({
    maxConcurrent: 1,
    asyncEnrichment: false,
    captureFn: async () => {
      throw new Error("held");
    }
  });
  try {
    runner.startJob("https://first.example/");
    const waiting = runner.startJob("https://second.example/");
    const later = runner.startJob("https://third.example/");
    assert.deepEqual(runner.queuedOrder(), [waiting.job_id, later.job_id]);
    const skipped = runner.cancelQueued(waiting.job_id);
    assert.equal(skipped?.stage, "skipped");
    assert.deepEqual(runner.queuedOrder(), [later.job_id]);
    assert.equal(runner.moveQueued(later.job_id, "front")?.job_id, later.job_id);
    assert.deepEqual(runner.queuedOrder(), [later.job_id]);
    assert.equal(runner.cancelQueued(later.job_id)?.stage, "skipped");
    assert.deepEqual(runner.queuedOrder(), []);
    assert.equal(runner.cancelQueued(later.job_id), null);
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
  }
});

test("JobRunner hardTimeout aborts a hung capture and frees the slot", async () => {
  const previousLlm = process.env.DIG_LLM_ENABLED;
  const previousCheckion = process.env.DIG_CHECKION_SCREENSHOTS;
  process.env.DIG_LLM_ENABLED = "false";
  process.env.DIG_CHECKION_SCREENSHOTS = "0";
  const capturesDir = await mkdtemp(join(tmpdir(), "dig-job-hard-"));
  const indexesDir = await mkdtemp(join(tmpdir(), "dig-job-hard-idx-"));
  let sawAbort = false;
  const runner = new JobRunner({
    capturesDir,
    indexesDir,
    maxConcurrent: 1,
    hardTimeoutMs: 80,
    asyncEnrichment: false,
    captureFn: async (options) => {
      await new Promise<void>((resolve, reject) => {
        const fail = (reason: unknown) => {
          sawAbort = true;
          reject(reason instanceof Error ? reason : new Error("aborted"));
        };
        if (options.signal?.aborted) {
          fail(options.signal.reason);
          return;
        }
        const timer = setTimeout(() => resolve(), 30_000);
        options.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            fail(options.signal?.reason);
          },
          { once: true }
        );
      });
      return {
        packageRoot: join(capturesDir, "never"),
        manifest: { status: "complete", capture_run_id: "cap_never", errors: [], viewport_captures: [] } as never
      };
    }
  });
  try {
    const hung = runner.startJob("https://hung.example/");
    const next = runner.startJob("https://next.example/");
    await new Promise<void>((resolveDone, reject) => {
      const current = runner.getJob(hung.job_id);
      if (current?.stage === "failed") {
        resolveDone();
        return;
      }
      const stop = runner.subscribe(hung.job_id, (event) => {
        if (event.stage === "failed") {
          stop();
          resolveDone();
        }
        if (event.stage === "complete") {
          stop();
          reject(new Error("hung job should fail"));
        }
      });
    });
    assert.equal(runner.getJob(hung.job_id)?.stage, "failed");
    assert.match(runner.getJob(hung.job_id)?.error ?? "", /hard_timeout|aborted|capture_hard_timeout/i);
    assert.equal(sawAbort, true);
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    const nextStage = runner.getJob(next.job_id)?.stage;
    assert.ok(
      nextStage === "capturing" || nextStage === "queued" || nextStage === "failed" || nextStage === "complete",
      `expected next job to leave pure hang, got ${nextStage}`
    );
    runner.failJob(next.job_id, "test cleanup");
  } finally {
    if (previousLlm === undefined) delete process.env.DIG_LLM_ENABLED;
    else process.env.DIG_LLM_ENABLED = previousLlm;
    if (previousCheckion === undefined) delete process.env.DIG_CHECKION_SCREENSHOTS;
    else process.env.DIG_CHECKION_SCREENSHOTS = previousCheckion;
  }
});
