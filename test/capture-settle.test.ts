import assert from "node:assert/strict";
import test from "node:test";
import { captureSettleConfig } from "../src/capture-settle.js";

test("captureSettleConfig reads longer initial and quiet waits from paths.json", () => {
  const cfg = captureSettleConfig();
  assert.equal(cfg.initialWaitMs, 2500);
  assert.equal(cfg.settleMs, 2500);
  assert.equal(cfg.postScrollQuietMs, 1500);
  assert.equal(cfg.scrollPauseMs, 80);
  assert.ok(cfg.postScrollQuietMs > 400);
  assert.ok(cfg.initialWaitMs >= 2000);
});
