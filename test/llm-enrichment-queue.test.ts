import assert from "node:assert/strict";
import test from "node:test";
import { MemoryLlmStageCache, evidenceSha256 } from "../src/llm-stage-cache.js";
import { meanConfidence, shouldEscalateStage } from "../src/llm-routing.js";
import { EnrichmentQueue } from "../src/enrichment-queue.js";

test("MemoryLlmStageCache round-trips by evidence hash", async () => {
  const cache = new MemoryLlmStageCache();
  const evidence = JSON.stringify({ hello: "world" });
  const hash = evidenceSha256(evidence);
  assert.equal(await cache.get("screen_patterns", "model-a", hash), null);
  await cache.set({
    stage_id: "screen_patterns",
    model: "model-a",
    evidence_sha256: hash,
    raw_response: '{"screen_patterns":[]}',
    status: "complete"
  });
  const hit = await cache.get("screen_patterns", "model-a", hash);
  assert.ok(hit);
  assert.equal(hit.cache_hit, true);
  assert.equal(hit.raw_response, '{"screen_patterns":[]}');
  assert.equal(await cache.get("screen_patterns", "model-b", hash), null);
});

test("shouldEscalateStage triggers on empty or low confidence", () => {
  assert.equal(shouldEscalateStage({ parseOk: false, itemCount: 2, confidences: [0.9], threshold: 0.55 }), true);
  assert.equal(shouldEscalateStage({ parseOk: true, itemCount: 0, confidences: [], threshold: 0.55 }), true);
  assert.equal(
    shouldEscalateStage({ parseOk: true, itemCount: 2, confidences: [0.4, 0.5], threshold: 0.55 }),
    true
  );
  assert.equal(
    shouldEscalateStage({ parseOk: true, itemCount: 2, confidences: [0.8, 0.9], threshold: 0.55 }),
    false
  );
  assert.ok(meanConfidence([0.5, 0.7]) > 0.5);
});

test("EnrichmentQueue processes queued job with injectable analyzeFn", async () => {
  process.env.DIG_LLM_VISION = "false";
  const queue = new EnrichmentQueue({
    autoStart: false,
    pollMs: 50,
    persist: async () => false,
    claim: async () => null,
    config: {
      enabled: true,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "test-model",
      timeoutMs: 5000
    },
    analyzeFn: async () => ({
      updated: true,
      analysis: {} as never,
      llm: {
        schema_version: "0.1.0",
        llm_design_version: "0.2.0",
        generated_at: new Date().toISOString(),
        model: "test",
        base_url: "http://example",
        status: "complete",
        design_summary: "Hero marketing",
        hypotheses: [{ hypothesis_id: "h1" }],
        vision: { status: "skipped" },
        cost: { prompt_tokens: 10, completion_tokens: 5, estimated_usd: 0, by_stage: [] }
      } as never
    }),
    reindexFn: async () => ({ indexed: true } as never),
    stageCache: new MemoryLlmStageCache()
  });
  try {
    const job = queue.enqueue({
      package_path: "/tmp/pkg",
      capture_run_id: "cap_1",
      capture_job_id: "job_1"
    });
    assert.equal(job.status, "queued");
    queue.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const done = queue.getJob(job.enrichment_job_id);
    assert.ok(done);
    assert.equal(done.status, "complete");
    assert.equal(done.design_summary, "Hero marketing");
    assert.equal(done.hypothesis_count, 1);
  } finally {
    queue.stop();
    delete process.env.DIG_LLM_VISION;
  }
});
