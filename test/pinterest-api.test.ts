import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { handlePinterestApi } from "../src/pinterest-api.js";

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

test("Pinterest status reports unconfigured when env is missing", async () => {
  const mock = mockResponse();
  const handled = await handlePinterestApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/pinterest/status"),
    { DIG_FEDERATION_MODE: "dummy" }
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const payload = JSON.parse(mock.body) as { configured: boolean; connected: boolean };
  assert.equal(payload.configured, false);
  assert.equal(payload.connected, false);
});

test("Pinterest oauth start is 503 without client credentials", async () => {
  const mock = mockResponse();
  const handled = await handlePinterestApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/pinterest/oauth/start"),
    { DIG_FEDERATION_MODE: "dummy" }
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 503);
  assert.match(mock.body, /pinterest_not_configured/);
});
