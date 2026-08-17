/**
 * Post-navigation settle timings for Playwright capture (from knowledge/paths.json).
 */
import { loadDigPaths } from "./runtime-paths.js";

export type CaptureSettleConfig = {
  settleMs: number;
  initialWaitMs: number;
  postScrollQuietMs: number;
  scrollStepPx: number;
  scrollMaxPx: number;
  scrollPauseMs: number;
};

function nonNegInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export function captureSettleConfig(root = process.cwd()): CaptureSettleConfig {
  const cfg = loadDigPaths(root).captureSettle;
  return {
    settleMs: nonNegInt(cfg?.settleMs, 2500),
    initialWaitMs: nonNegInt(cfg?.initialWaitMs, 2500),
    postScrollQuietMs: nonNegInt(cfg?.postScrollQuietMs, 1500),
    scrollStepPx: Math.max(1, nonNegInt(cfg?.scrollStepPx, 100)),
    scrollMaxPx: Math.max(1, nonNegInt(cfg?.scrollMaxPx, 8000)),
    scrollPauseMs: nonNegInt(cfg?.scrollPauseMs, 80)
  };
}
