/**
 * Post-navigation settle timings for Playwright capture (from knowledge/paths.json).
 */
import { loadDigPaths } from "./runtime-paths.js";

export type CaptureSettleConfig = {
  settleMs: number;
  initialWaitMs: number;
  postScrollQuietMs: number;
  /** Max wall time for one MutationObserver quiet wait (fail-open with warning). */
  stabilizeTimeoutMs: number;
  /** Max wait for document.fonts.ready before continuing. */
  fontsReadyTimeoutMs: number;
  scrollStepPx: number;
  scrollMaxPx: number;
  scrollPauseMs: number;
  /** Cap scroll-walk wall clock so growing pages cannot burn the hard job timeout. */
  scrollMaxDurationMs: number;
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
    stabilizeTimeoutMs: Math.max(1000, nonNegInt(cfg?.stabilizeTimeoutMs, 12000)),
    fontsReadyTimeoutMs: Math.max(0, nonNegInt(cfg?.fontsReadyTimeoutMs, 5000)),
    scrollStepPx: Math.max(1, nonNegInt(cfg?.scrollStepPx, 150)),
    scrollMaxPx: Math.max(1, nonNegInt(cfg?.scrollMaxPx, 6000)),
    scrollPauseMs: nonNegInt(cfg?.scrollPauseMs, 50),
    scrollMaxDurationMs: Math.max(1000, nonNegInt(cfg?.scrollMaxDurationMs, 18000))
  };
}
