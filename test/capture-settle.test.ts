import assert from "node:assert/strict";
import test from "node:test";
import { captureSettleConfig } from "../src/capture-settle.js";

test("captureSettleConfig reads longer initial and quiet waits from paths.json", () => {
  const cfg = captureSettleConfig();
  assert.equal(cfg.initialWaitMs, 2500);
  assert.equal(cfg.settleMs, 2500);
  assert.equal(cfg.postScrollQuietMs, 1500);
  assert.equal(cfg.scrollPauseMs, 50);
  assert.equal(cfg.scrollStepPx, 150);
  assert.equal(cfg.scrollMaxPx, 6000);
  assert.ok(cfg.postScrollQuietMs > 400);
  assert.ok(cfg.initialWaitMs >= 2000);
});

test("captureSettleConfig caps stabilize and scroll so hard timeouts are rare", () => {
  const cfg = captureSettleConfig();
  assert.equal(cfg.stabilizeTimeoutMs, 12000);
  assert.equal(cfg.fontsReadyTimeoutMs, 5000);
  assert.equal(cfg.scrollMaxDurationMs, 18000);
  // Two stabilize waits + scroll must stay well under the 480s hard timeout × 3 viewports.
  const perViewportBudget =
    cfg.initialWaitMs + cfg.stabilizeTimeoutMs + cfg.scrollMaxDurationMs + cfg.stabilizeTimeoutMs;
  assert.ok(perViewportBudget < 60_000, `per-viewport settle budget too high: ${perViewportBudget}`);
  assert.ok(perViewportBudget * 3 < 480_000);
});
