import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProjectDomain } from "../src/dig-projects.js";
import { JobRunner } from "../src/job-runner.js";

test("normalizeProjectDomain strips scheme and path", () => {
  assert.equal(normalizeProjectDomain("https://live.example/path"), "live.example");
  assert.equal(normalizeProjectDomain("live.example"), "live.example");
  assert.equal(normalizeProjectDomain("  "), null);
});

test("startJob stores Collection scope on the job record", async () => {
  const runner = new JobRunner({
    captureFn: async () => {
      throw new Error("stop");
    },
    timeoutMs: 50,
    settleMs: 1
  });
  const job = runner.startJob("https://example.com", {
    platformProjectId: "pp-scope-1",
    digProjectId: "dig-abc"
  });
  assert.equal(job.platform_project_id, "pp-scope-1");
  assert.equal(job.dig_project_id, "dig-abc");
  // allow async run to fail without unhandled rejection noise
  await new Promise((r) => setTimeout(r, 20));
});
