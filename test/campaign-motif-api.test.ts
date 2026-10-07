import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { handleCampaignMotifApi } from "../src/campaign-motif-api.js";
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

test("GET /api/campaign-motifs returns allowlist summary", async () => {
  const mock = mockResponse();
  const handled = await handleCampaignMotifApi(
    { method: "GET", headers: {} } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/campaign-motifs")
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const payload = JSON.parse(mock.body) as {
    packs?: Array<{ id: string; assetCount: number; licenseClass?: string }>;
    default_asset_kind?: string;
  };
  assert.equal(payload.default_asset_kind, "print_ad");
  assert.ok((payload.packs?.length ?? 0) >= 2);
  assert.ok(payload.packs?.some((p) => p.id === "wwi_wwii_posters" && p.assetCount >= 1));
  assert.ok(payload.packs?.every((p) => p.licenseClass === "public_domain"));
});

test("GET /api/campaign-motifs/:id 404 for unknown pack", async () => {
  const mock = mockResponse();
  const handled = await handleCampaignMotifApi(
    { method: "GET", headers: {} } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/campaign-motifs/nope")
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 404);
});

test("POST /api/campaign-motifs/sync requires Bearer", async () => {
  const prevToken = process.env.DIG_API_TOKEN;
  process.env.DIG_API_TOKEN = "dig_secret_test";
  try {
    const unauth = mockResponse();
    const handledUnauth = await handleCampaignMotifApi(
      {
        method: "POST",
        headers: {},
        async *[Symbol.asyncIterator]() {
          yield Buffer.from("{}");
        }
      } as unknown as IncomingMessage,
      unauth.response,
      new URL("http://127.0.0.1/api/campaign-motifs/sync")
    );
    assert.equal(handledUnauth, true);
    assert.equal(unauth.statusCode, 401);
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
  }
});

test("POST /api/campaign-motifs/sync queues motif upload jobs", async () => {
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
        yield Buffer.from(JSON.stringify({ packId: "wwi_wwii_posters", limit: 1 }));
      }
    } as unknown as IncomingMessage;

    const handled = await handleCampaignMotifApi(
      request,
      mock.response,
      new URL("http://127.0.0.1/api/campaign-motifs/sync")
    );
    assert.equal(handled, true);
    assert.equal(mock.statusCode, 202);
    const payload = JSON.parse(mock.body) as {
      queued?: number;
      jobs?: Array<{ source?: string; asset_kind?: string; pack_id?: string }>;
      skipped?: number;
      skipped_assets?: Array<{ reason: string }>;
    };
    assert.ok(
      (payload.queued ?? 0) >= 1,
      `expected queued>=1 got ${payload.queued} skipped=${JSON.stringify(payload.skipped_assets)} body=${mock.body}`
    );
    assert.ok(started.every((f) => f.source_id.startsWith("motif_wwi_wwii_posters_")));
    assert.ok(started.every((f) => f.asset_kind === "print_ad" || f.asset_kind === "campaign_keyvisual"));
    assert.ok(payload.jobs?.every((j) => j.source === "connector:campaign_motif"));
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
  }
});
