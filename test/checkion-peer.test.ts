import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkionConfig,
  checkionPeerReadyReason,
  isCheckionConfigured
} from "../src/checkion-client.js";

async function pathsRoot(screenshotsEnabled: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dig-checkion-paths-"));
  await mkdir(join(root, "knowledge"), { recursive: true });
  await writeFile(
    join(root, "knowledge/paths.json"),
    JSON.stringify({
      checkionV3: {
        screenshotsEnabled,
        attachPollTimeoutMs: 45_000,
        attachFetchTimeoutMs: 20_000,
        apiUrlEnv: "CHECKION_API_URL",
        apiTokenEnv: "CHECKION_API_TOKEN",
        projectIdEnv: "CHECKION_PROJECT_ID",
        devWebPort: 3007
      }
    }),
    "utf8"
  );
  return root;
}

test("staging CHECKION without token is not ready", async () => {
  const root = await pathsRoot(true);
  const config = checkionConfig(
    {
      CHECKION_API_URL: "https://checkion-v3.projects-a.plygrnd.tech",
      DIG_CHECKION_SCREENSHOTS: "1"
    },
    root
  );
  assert.equal(isCheckionConfigured(config), false);
  assert.match(checkionPeerReadyReason(config) ?? "", /CHECKION_API_TOKEN/);
});

test("local CHECKION without token is ready when enabled", async () => {
  const root = await pathsRoot(true);
  const config = checkionConfig(
    {
      CHECKION_API_URL: "http://127.0.0.1:3007",
      DIG_CHECKION_SCREENSHOTS: "1"
    },
    root
  );
  assert.equal(isCheckionConfigured(config), true);
  assert.equal(checkionPeerReadyReason(config), null);
});

test("disabled flag skips even with URL", async () => {
  const root = await pathsRoot(true);
  const config = checkionConfig(
    {
      CHECKION_API_URL: "https://checkion-v3.projects-a.plygrnd.tech",
      CHECKION_API_TOKEN: "checkion_test",
      DIG_CHECKION_SCREENSHOTS: "0"
    },
    root
  );
  assert.equal(isCheckionConfigured(config), false);
  assert.match(checkionPeerReadyReason(config) ?? "", /disabled/i);
});

test("paths screenshotsEnabled false overrides DIG_CHECKION_SCREENSHOTS=1", () => {
  const config = checkionConfig({
    CHECKION_API_URL: "https://checkion-v3.projects-a.plygrnd.tech",
    CHECKION_API_TOKEN: "checkion_test",
    DIG_CHECKION_SCREENSHOTS: "1"
  });
  assert.equal(isCheckionConfigured(config), false);
  assert.match(checkionPeerReadyReason(config) ?? "", /screenshotsEnabled=false/);
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
