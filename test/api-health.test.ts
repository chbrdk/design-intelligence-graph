import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("GET /api/health returns ok without capturing", async () => {
  process.env.DIG_WEB_STATIC = "0";
  const { createWebServer } = await import("../src/web-server.js");
  const api = createWebServer();
  await new Promise<void>((resolveListening) => api.listen(0, "127.0.0.1", resolveListening));
  const address = api.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; service: string };
    assert.equal(body.ok, true);
    assert.equal(body.service, "dig-api");

    const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
      api: { healthPath: string };
    };
    assert.equal(paths.api.healthPath, "/api/health");
  } finally {
    await new Promise<void>((resolveClosed, reject) =>
      api.close((error) => (error ? reject(error) : resolveClosed()))
    );
    delete process.env.DIG_WEB_STATIC;
  }
});
