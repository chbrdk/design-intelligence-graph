import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { assertDestructiveAuth, assertMachineAuth, extractBearerToken } from "../src/api-auth.js";

function fakeRequest(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

test("dummy mode allows unauthenticated library calls", () => {
  const result = assertMachineAuth(fakeRequest({}), { DIG_FEDERATION_MODE: "dummy" });
  assert.equal(result.ok, true);
});

test("live mode rejects missing bearer when DIG_API_TOKEN set", () => {
  const result = assertMachineAuth(fakeRequest({}), {
    DIG_FEDERATION_MODE: "live",
    DIG_API_TOKEN: "dig_secret_test"
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 401);
});

test("live mode accepts matching Bearer DIG_API_TOKEN", () => {
  const result = assertMachineAuth(fakeRequest({ authorization: "Bearer dig_secret_test" }), {
    DIG_FEDERATION_MODE: "live",
    DIG_API_TOKEN: "dig_secret_test"
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.authenticated, true);
});

test("live mode accepts x-service-secret matching PLEXON_SERVICE_SECRET", () => {
  const result = assertMachineAuth(fakeRequest({ "x-service-secret": "svc" }), {
    DIG_FEDERATION_MODE: "live",
    DIG_API_TOKEN: "dig_secret_test",
    PLEXON_SERVICE_SECRET: "svc"
  });
  assert.equal(result.ok, true);
});

test("extractBearerToken parses header", () => {
  assert.equal(extractBearerToken(fakeRequest({ authorization: "Bearer abc" })), "abc");
  assert.equal(extractBearerToken(fakeRequest({})), null);
});

test("destructive auth requires a token even in dummy mode", () => {
  const denied = assertDestructiveAuth(fakeRequest({}), {
    DIG_FEDERATION_MODE: "dummy",
    DIG_API_TOKEN: "dig_secret_test"
  });
  assert.equal(denied.ok, false);

  const allowed = assertDestructiveAuth(fakeRequest({ authorization: "Bearer dig_secret_test" }), {
    DIG_FEDERATION_MODE: "dummy",
    DIG_API_TOKEN: "dig_secret_test"
  });
  assert.equal(allowed.ok, true);
});
