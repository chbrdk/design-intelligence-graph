import assert from "node:assert/strict";
import test from "node:test";
import { aggregateQuality, evaluateQuality, QUALITY_WEIGHTS, ZERO_QUALITY_METRICS } from "../src/quality.js";

test("quality weights sum to one", () => {
  assert.ok(Math.abs(Object.values(QUALITY_WEIGHTS).reduce((sum, value) => sum + value, 0) - 1) < Number.EPSILON * 2);
});

test("evaluates perfect and empty quality inputs", () => {
  const perfect = evaluateQuality(Object.fromEntries(Object.keys(QUALITY_WEIGHTS).map((key) => [key, 1])) as unknown as typeof ZERO_QUALITY_METRICS);
  assert.equal(perfect.overall, 1);
  assert.equal(perfect.rating, "excellent");
  assert.equal(evaluateQuality(ZERO_QUALITY_METRICS).rating, "poor");
});

test("bounds invalid metric values", () => {
  const result = evaluateQuality({ ...ZERO_QUALITY_METRICS, geometry_coverage: 2, style_coverage: Number.NaN });
  assert.equal(result.metrics.geometry_coverage, 1);
  assert.equal(result.metrics.style_coverage, 0);
});

test("aggregates viewport metrics before scoring", () => {
  const low = evaluateQuality(ZERO_QUALITY_METRICS);
  const high = evaluateQuality(Object.fromEntries(Object.keys(QUALITY_WEIGHTS).map((key) => [key, 1])) as unknown as typeof ZERO_QUALITY_METRICS);
  assert.equal(aggregateQuality([low, high]).overall, 0.5);
});
