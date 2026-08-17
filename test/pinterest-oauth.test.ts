import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPinterestAuthorizeUrl,
  pinterestClientConfigured,
  pinterestRedirectUri
} from "../src/pinterest-oauth.js";
import { pinterestConfig } from "../src/runtime-paths.js";

test("Pinterest OAuth authorize URL uses paths.json scopes and island callback", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-pinterest-oauth-"));
  try {
    const cfg = pinterestConfig();
    assert.deepEqual(cfg.oauthScopes, ["boards:read", "pins:read", "user_accounts:read"]);
    assert.equal(cfg.islandCallbackPath, "/api/pinterest/callback");
    assert.equal(pinterestClientConfigured({}), false);
    const env = {
      PINTEREST_CLIENT_ID: "app_123",
      PINTEREST_CLIENT_SECRET: "secret_123",
      PINTEREST_REDIRECT_URI: "https://spirion.example/api/pinterest/callback"
    };
    assert.equal(pinterestClientConfigured(env), true);
    assert.equal(pinterestRedirectUri(env), "https://spirion.example/api/pinterest/callback");
    const started = await createPinterestAuthorizeUrl(env, root);
    const url = new URL(started.authorize_url);
    assert.equal(url.origin + url.pathname, "https://www.pinterest.com/oauth/");
    assert.equal(url.searchParams.get("client_id"), "app_123");
    assert.equal(url.searchParams.get("redirect_uri"), env.PINTEREST_REDIRECT_URI);
    assert.match(url.searchParams.get("scope") ?? "", /boards:read/);
    assert.equal(url.searchParams.get("state"), started.state);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
