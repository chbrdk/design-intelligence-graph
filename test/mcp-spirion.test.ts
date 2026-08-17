import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyKnowledgeGraph, handleMcpMessage, listDigTools } from "../src/mcp-api.js";
import { setDigApiRuntime, getDigApiRuntime } from "../src/dig-api-runtime.js";
import { JobRunner } from "../src/job-runner.js";
import { EnrichmentQueue } from "../src/enrichment-queue.js";
import { listSpirionTools, SPIRION_DIG_ALIASES, SPIRION_TOOL_PREFIX } from "../src/mcp-spirion.js";
import { loadDigPaths } from "../src/runtime-paths.js";

function toolText(result: unknown): unknown {
  const payload = result as { content: Array<{ text: string }> };
  return JSON.parse(payload.content[0]!.text) as unknown;
}

test("spirion tools are listed from paths.json prefix and include health + job_start", () => {
  const paths = loadDigPaths();
  assert.equal(paths.mcpSpirion?.prefix, SPIRION_TOOL_PREFIX);
  const names = listDigTools().map((tool) => tool.name);
  for (const suffix of paths.mcpSpirion?.tools ?? []) {
    assert.ok(names.includes(`${SPIRION_TOOL_PREFIX}${suffix}`), suffix);
  }
  assert.equal(listSpirionTools().length, paths.mcpSpirion?.tools?.length);
  assert.ok(names.includes("dig_search"));
  assert.ok(names.includes("dig_screen_search"));
});

test("spirion.health and jobs work with injected runtime; omit package paths", async () => {
  const graph = emptyKnowledgeGraph();
  const health = await handleMcpMessage(graph, {
    id: 1,
    method: "tools/call",
    params: { name: "spirion.health", arguments: {} }
  });
  const healthBody = toolText(health?.result) as { ok: boolean; service: string; auth: string };
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.service, "spirion");
  assert.equal(healthBody.auth, "in-process");

  const missing = await handleMcpMessage(graph, {
    id: 2,
    method: "tools/call",
    params: { name: "spirion.jobs_list", arguments: {} }
  });
  assert.match(String(missing?.error?.message), /dig-api HTTP process/);

  const runner = new JobRunner({
    captureFn: async () => {
      throw new Error("stop");
    },
    timeoutMs: 50,
    settleMs: 1
  });
  const enrichmentQueue = new EnrichmentQueue({ autoStart: false });
  const previous = getDigApiRuntime();
  setDigApiRuntime({ runner, enrichmentQueue });
  try {
    const started = await handleMcpMessage(graph, {
      id: 3,
      method: "tools/call",
      params: {
        name: "spirion.job_start",
        arguments: { url: "https://example.com", platformProjectId: "pp_test" }
      }
    });
    const job = toolText(started?.result) as {
      job_id: string;
      url: string;
      platform_project_id?: string;
      result?: Record<string, unknown>;
    };
    assert.ok(job.job_id.startsWith("job_"));
    assert.equal(job.url, "https://example.com/");
    assert.equal(job.platform_project_id, "pp_test");
    assert.equal(job.result?.package_root, undefined);

    const listed = await handleMcpMessage(graph, {
      id: 4,
      method: "tools/call",
      params: { name: "spirion.jobs_list", arguments: {} }
    });
    const jobs = toolText(listed?.result) as { jobs: Array<{ job_id: string }> };
    assert.equal(jobs.jobs[0]?.job_id, job.job_id);

    const got = await handleMcpMessage(graph, {
      id: 5,
      method: "tools/call",
      params: { name: "spirion.job_get", arguments: { job_id: job.job_id } }
    });
    const one = toolText(got?.result) as { job_id: string };
    assert.equal(one.job_id, job.job_id);

    enrichmentQueue.enqueue({
      package_path: "/secret/captures/pkg",
      capture_run_id: "cap_hidden"
    });
    const enrichList = await handleMcpMessage(graph, {
      id: 6,
      method: "tools/call",
      params: { name: "spirion.enrichment_list", arguments: {} }
    });
    const enrich = toolText(enrichList?.result) as { jobs: Array<Record<string, unknown>> };
    const hidden = enrich.jobs.find((job) => job.capture_run_id === "cap_hidden");
    assert.ok(hidden);
    assert.equal(hidden.package_path, undefined);
  } finally {
    setDigApiRuntime(previous);
    await new Promise((r) => setTimeout(r, 20));
  }
});

test("spirion.screens_search aliases dig_screen_search", () => {
  assert.equal(SPIRION_DIG_ALIASES["spirion.screens_search"], "dig_screen_search");
  assert.equal(SPIRION_DIG_ALIASES["spirion.generate"], "dig_generate");
  const schema = JSON.parse(
    readFileSync(resolve("schemas/mcp-spirion-tools.schema.json"), "utf8")
  ) as { properties: { name: { pattern: string } } };
  assert.match("spirion.job_start", new RegExp(schema.properties.name.pattern));
});

test("initialize serverInfo uses spirion", async () => {
  const init = await handleMcpMessage(emptyKnowledgeGraph(), {
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25" }
  });
  const result = init?.result as { serverInfo: { name: string } };
  assert.equal(result.serverInfo.name, "spirion");
});
