import assert from "node:assert/strict";
import test from "node:test";
import {
  checkionConfig,
  checkionPeerReadyReason,
  isCheckionConfigured
} from "../src/checkion-client.js";

test("staging CHECKION without token is not ready", () => {
  const config = checkionConfig({
    CHECKION_API_URL: "https://checkion-v3.projects-a.plygrnd.tech",
    DIG_CHECKION_SCREENSHOTS: "1"
  });
  assert.equal(isCheckionConfigured(config), false);
  assert.match(checkionPeerReadyReason(config) ?? "", /CHECKION_API_TOKEN/);
});

test("local CHECKION without token is ready when enabled", () => {
  const config = checkionConfig({
    CHECKION_API_URL: "http://127.0.0.1:3007",
    DIG_CHECKION_SCREENSHOTS: "1"
  });
  assert.equal(isCheckionConfigured(config), true);
  assert.equal(checkionPeerReadyReason(config), null);
});

test("disabled flag skips even with URL", () => {
  const config = checkionConfig({
    CHECKION_API_URL: "https://checkion-v3.projects-a.plygrnd.tech",
    CHECKION_API_TOKEN: "checkion_test",
    DIG_CHECKION_SCREENSHOTS: "0"
  });
  assert.equal(isCheckionConfigured(config), false);
  assert.match(checkionPeerReadyReason(config) ?? "", /disabled/i);
});

test("checkionConfig defaults attach poll/fetch timeouts from paths.json", () => {
  const config = checkionConfig({ DIG_CHECKION_SCREENSHOTS: "0" });
  assert.equal(config.pollTimeoutMs, 45_000);
  assert.equal(config.fetchTimeoutMs, 20_000);
});

test("CHECKION_POLL_TIMEOUT_MS and CHECKION_FETCH_TIMEOUT_MS override paths", () => {
  const config = checkionConfig({
    DIG_CHECKION_SCREENSHOTS: "0",
    CHECKION_POLL_TIMEOUT_MS: "12000",
    CHECKION_FETCH_TIMEOUT_MS: "8000"
  });
  assert.equal(config.pollTimeoutMs, 12_000);
  assert.equal(config.fetchTimeoutMs, 8_000);
});
