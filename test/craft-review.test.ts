import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { parseCraftReviewPatchBody } from "../src/craft-review.js";
import { handleLibraryApi } from "../src/library-api.js";

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

test("parseCraftReviewPatchBody requires craftEligible", () => {
  assert.deepEqual(parseCraftReviewPatchBody({}), { error: "craftEligible_required" });
  assert.deepEqual(parseCraftReviewPatchBody({ craftEligible: true }), {
    craftEligible: true,
    reviewNote: null
  });
  assert.deepEqual(
    parseCraftReviewPatchBody({ craft_eligible: false, review_note: "  ok  " }),
    { craftEligible: false, reviewNote: "ok" }
  );
});

test("PATCH /api/library/captures/:id updates craftEligible via injectable client", async () => {
  const prevToken = process.env.DIG_API_TOKEN;
  const prevMode = process.env.DIG_FEDERATION_MODE;
  process.env.DIG_API_TOKEN = "dig_secret_test";
  process.env.DIG_FEDERATION_MODE = "dummy";
  try {
    const mock = mockResponse();
    let sawUpdate = false;
    const client = {
      async query(sql: string, values: unknown[] = []) {
        if (/UPDATE captures/i.test(sql)) {
          sawUpdate = true;
          assert.equal(values[0], "cap_review_1");
          assert.equal(values[1], true);
          assert.equal(values[2], "allowlist after visual QA");
          return {
            rows: [
              {
                capture_run_id: "cap_review_1",
                asset_kind: "campaign_keyvisual",
                source: "connector:dribbble",
                license_class: "connector_tos",
                craft_eligible: true,
                enrichment_status: "ready",
                craft_reviewed_at: "2026-10-07T12:00:00.000Z",
                craft_review_note: "allowlist after visual QA"
              }
            ]
          };
        }
        return { rows: [] };
      }
    };
    const request = {
      method: "PATCH",
      headers: { authorization: "Bearer dig_secret_test" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(
          JSON.stringify({
            craftEligible: true,
            reviewNote: "allowlist after visual QA"
          })
        );
      }
    } as unknown as IncomingMessage;

    const handled = await handleLibraryApi(
      request,
      mock.response,
      new URL("http://127.0.0.1/api/library/captures/cap_review_1"),
      client
    );
    assert.equal(handled, true);
    assert.equal(sawUpdate, true);
    assert.equal(mock.statusCode, 200);
    const payload = JSON.parse(mock.body) as {
      ok?: boolean;
      craftEligible?: boolean;
      craftReviewNote?: string;
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.craftEligible, true);
    assert.equal(payload.craftReviewNote, "allowlist after visual QA");
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
    if (prevMode === undefined) delete process.env.DIG_FEDERATION_MODE;
    else process.env.DIG_FEDERATION_MODE = prevMode;
  }
});

test("PATCH /api/library/captures/:id returns 404 when missing", async () => {
  const prevToken = process.env.DIG_API_TOKEN;
  process.env.DIG_API_TOKEN = "dig_secret_test";
  try {
    const mock = mockResponse();
    const client = {
      async query() {
        return { rows: [] };
      }
    };
    const request = {
      method: "PATCH",
      headers: { authorization: "Bearer dig_secret_test" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ craftEligible: false }));
      }
    } as unknown as IncomingMessage;
    const handled = await handleLibraryApi(
      request,
      mock.response,
      new URL("http://127.0.0.1/api/library/captures/missing"),
      client
    );
    assert.equal(handled, true);
    assert.equal(mock.statusCode, 404);
    assert.match(mock.body, /capture_not_found/);
  } finally {
    if (prevToken === undefined) delete process.env.DIG_API_TOKEN;
    else process.env.DIG_API_TOKEN = prevToken;
  }
});

test("GET /api/library/captures filters craftEligible=true", async () => {
  const mock = mockResponse();
  let sawFilter = false;
  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (/FROM captures/i.test(sql)) {
        sawFilter = true;
        assert.match(sql, /craft_eligible = \$/);
        assert.equal(values.includes(true), true);
        return {
          rows: [
            {
              capture_run_id: "cap_ok",
              package_path: "/tmp",
              requested_url: "https://example.com/import/image/x/",
              canonical_url: "https://example.com/import/image/x/",
              status: "complete",
              site_domain: "example.com",
              page_route: "/",
              quality_overall: 1,
              quality_rating: "good",
              started_at: null,
              completed_at: null,
              indexed_at: new Date().toISOString(),
              dig_project_id: null,
              platform_project_id: null,
              asset_kind: "campaign_keyvisual",
              source: "upload",
              source_id: "upload_1",
              license_class: "customer_owned",
              craft_eligible: true,
              enrichment_status: "ready",
              format: {},
              tags: []
            }
          ]
        };
      }
      return { rows: [] };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/captures?craftEligible=true"),
    client
  );
  assert.equal(handled, true);
  assert.equal(sawFilter, true);
  assert.equal(mock.statusCode, 200);
  assert.match(mock.body, /cap_ok/);
  assert.match(mock.body, /"craftEligible":true/);
});
