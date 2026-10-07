import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { handleBrandKitApi } from "../src/brand-kit-api.js";
import { setDigApiRuntime } from "../src/dig-api-runtime.js";

function mockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";
  const response = {
    writeHead(status: number, nextHeaders?: Record<string, string>) {
      statusCode = status;
      Object.assign(headers, nextHeaders ?? {});
      return response;
    },
    end(payload?: string) {
      body = payload ?? "";
      return response;
    },
    write() {
      return true;
    }
  } as unknown as ServerResponse;
  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    }
  };
}

test("GET /api/brand-kits returns allowlist summary", async () => {
  const mock = mockResponse();
  const handled = await handleBrandKitApi(
    { method: "GET", headers: {} } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/brand-kits")
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const payload = JSON.parse(mock.body) as {
    kits?: Array<{ id: string; assetCount: number }>;
    default_asset_kind?: string;
  };
  assert.equal(payload.default_asset_kind, "brand_system");
  assert.ok((payload.kits?.length ?? 0) >= 2);
  assert.ok(payload.kits?.some((k) => k.id === "pulumi" && k.assetCount >= 1));
});

test("GET /api/brand-kits/:id 404 for unknown kit", async () => {
  const mock = mockResponse();
  const handled = await handleBrandKitApi(
    { method: "GET", headers: {} } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/brand-kits/nope")
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 404);
});

test("POST /api/brand-kits/repair-provenance requires Bearer", async () => {
  const prevToken = process.env.DIG_API_TOKEN;
  process.env.DIG_API_TOKEN = "dig_secret_test";
  try {
    const unauth = mockResponse();
    const handledUnauth = await handleBrandKitApi(
      {
        method: "POST",
        headers: {},
        async *[Symbol.asyncIterator]() {
          yield Buffer.from("{}");
        }
      } as unknown as IncomingMessage,
      unauth.response,
      new URL("http://127.0.0.1/api/brand-kits/repair-provenance")
    );
    assert.equal(handledUnauth, true);
    assert.equal(unauth.statusCode, 401);
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
  }
});

test("POST /api/brand-kits/sync queues brandkit upload jobs for pulumi", async () => {
  const prevToken = process.env.DIG_API_TOKEN;
  process.env.DIG_API_TOKEN = "dig_secret_test";
  const started: Array<{ source_id: string; asset_kind?: string }> = [];
  setDigApiRuntime({
    runner: {
      startUploadJob(file: { source_id: string; asset_kind?: string }) {
        started.push(file);
        return { job_id: `job_${started.length}`, stage: "queued" };
      }
    },
    enrichmentQueue: {}
  } as never);

  try {
    const mock = mockResponse();
    const request = {
      method: "POST",
      headers: { authorization: "Bearer dig_secret_test" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ kitId: "pulumi", limit: 2 }));
      }
    } as unknown as IncomingMessage;

    const handled = await handleBrandKitApi(
      request,
      mock.response,
      new URL("http://127.0.0.1/api/brand-kits/sync")
    );
    assert.equal(handled, true);
    assert.equal(mock.statusCode, 202);
    const payload = JSON.parse(mock.body) as {
      queued?: number;
      jobs?: Array<{ source?: string; asset_kind?: string; kit_id?: string }>;
    };
    assert.ok((payload.queued ?? 0) >= 1, `expected queued>=1 got ${payload.queued} body=${mock.body}`);
    assert.ok(started.every((f) => f.source_id.startsWith("brandkit_pulumi_")));
    assert.ok(started.every((f) => f.asset_kind === "brand_system"));
    assert.ok(payload.jobs?.every((j) => j.source === "connector:brand_kit"));
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
  }
});
