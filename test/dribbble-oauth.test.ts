import assert from "node:assert/strict";
import test from "node:test";
import { dribbbleConfig } from "../src/runtime-paths.js";
import { dribbbleClientConfigured, dribbbleRedirectUri } from "../src/dribbble-oauth.js";

test("dribbbleConfig exposes official API paths and env keys", () => {
  const cfg = dribbbleConfig();
  assert.equal(cfg.apiPrefix, "/api/dribbble");
  assert.equal(cfg.clientIdEnv, "DRIBBBLE_CLIENT_ID");
  assert.equal(cfg.clientSecretEnv, "DRIBBBLE_CLIENT_SECRET");
  assert.ok(cfg.oauthScopes.includes("public"));
  assert.equal(cfg.licenseClass, "connector_tos");
  assert.equal(cfg.craftEligibleDefault, false);
});

test("dribbbleClientConfigured is false without secrets", () => {
  assert.equal(dribbbleClientConfigured({}), false);
  assert.equal(
    dribbbleClientConfigured({
      DRIBBBLE_CLIENT_ID: "id",
      DRIBBBLE_CLIENT_SECRET: "secret"
    }),
    true
  );
});

test("dribbbleRedirectUri uses env override", () => {
  const uri = dribbbleRedirectUri({
    DRIBBBLE_REDIRECT_URI: "https://example.test/api/dribbble/callback"
  });
  assert.equal(uri, "https://example.test/api/dribbble/callback");
});
