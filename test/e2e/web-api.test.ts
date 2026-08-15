import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("web API runs fixture capture through verify and index", { timeout: 180_000 }, async () => {
  process.env.DIG_WEB_STATIC = "0";
  process.env.DIG_CAPTURES_DIR = await mkdtemp(join(tmpdir(), "dig-api-cap-"));
  process.env.DIG_INDEXES_DIR = await mkdtemp(join(tmpdir(), "dig-api-idx-"));

  const { createWebServer } = await import("../../src/web-server.js");
  const fixtureRoot = resolve("examples/fixture");
  const fixtureServer = createServer(async (request, response) => {
    const path = request.url?.startsWith("/fixture.css") ? "fixture.css" : "index.html";
    response.setHeader("content-type", path.endsWith(".css") ? "text/css" : "text/html");
    response.end(await readFile(join(fixtureRoot, path)));
  });
  await new Promise<void>((resolveListening) => fixtureServer.listen(0, "127.0.0.1", resolveListening));
  const fixtureAddress = fixtureServer.address();
  assert.ok(fixtureAddress && typeof fixtureAddress === "object");

  const api = createWebServer();
  await new Promise<void>((resolveListening) => api.listen(0, "127.0.0.1", resolveListening));
  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress === "object");
  const base = `http://127.0.0.1:${apiAddress.port}`;

  try {
    const created = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${fixtureAddress.port}/` })
    });
    assert.equal(created.status, 202);
    const job = (await created.json()) as { job_id: string };
    assert.ok(job.job_id);

    let finalStage = "";
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
      const snapshot = await fetch(`${base}/api/jobs/${encodeURIComponent(job.job_id)}`);
      const body = (await snapshot.json()) as { stage: string; error?: string; result?: { nodes?: number } };
      finalStage = body.stage;
      if (body.stage === "complete") {
        assert.ok((body.result?.nodes ?? 0) > 0);
        return;
      }
      if (body.stage === "failed") throw new Error(body.error ?? "job failed");
    }
    throw new Error(`Timed out waiting for job completion (last stage: ${finalStage})`);
  } finally {
    await new Promise<void>((resolveClosed, reject) => api.close((error) => (error ? reject(error) : resolveClosed())));
    await new Promise<void>((resolveClosed, reject) => fixtureServer.close((error) => (error ? reject(error) : resolveClosed())));
    delete process.env.DIG_WEB_STATIC;
    delete process.env.DIG_CAPTURES_DIR;
    delete process.env.DIG_INDEXES_DIR;
  }
});
