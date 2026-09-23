import assert from "node:assert/strict";
import test from "node:test";
import {
  asCompositionContract,
  emptyCompositionContract
} from "../src/composition-contract.js";
import {
  GRAPHIC_CRAFT_METRIC_DEFS,
  graphicCraftMetricCount
} from "../src/graphic-craft-metrics-catalog.js";
import {
  designFacetHintsFromGraphicMetrics,
  mergeFacetsWithGraphicCraftHints,
  parseGraphicCraftMetricsResponse,
  refineCompositionFromCraftMetrics,
  compactGraphicCraftBrief
} from "../src/graphic-craft-metrics.js";
import { loadDigPaths } from "../src/runtime-paths.js";

test("craft metric catalog stays near 300 closed axes", () => {
  const n = graphicCraftMetricCount();
  assert.ok(n >= 290 && n <= 320, `expected ~300 metrics, got ${n}`);
  const ids = new Set(GRAPHIC_CRAFT_METRIC_DEFS.map((d) => d.id));
  assert.equal(ids.size, n);
  assert.match(loadDigPaths().graphicCraftMetrics?.relativePath ?? "", /graphic-craft-metrics/);
  assert.equal(loadDigPaths().graphicCraftMetrics?.metricCount, n);
});

test("parseGraphicCraftMetricsResponse coerces scores enums and measured fallback", () => {
  const measured = {
    "format.orientation": "portrait",
    "format.aspect_family": "4:5",
    "color.luminance": 0.22
  };
  const parsed = parseGraphicCraftMetricsResponse(
    {
      confidence: 0.81,
      metrics: {
        "tone.luxury": 0.9,
        "tone.minimal": 0.1,
        "comp.layout_family": "full-bleed-product",
        "prod.cta_present": true,
        "color.dominant_hex": "C41E3A",
        "prod.primary_claim_guess": "  Claim line  ",
        "color.contrast_punch": 85
      }
    },
    measured
  );
  assert.equal(parsed.metrics["tone.luxury"], 0.9);
  assert.equal(parsed.metrics["comp.layout_family"], "full-bleed-product");
  assert.equal(parsed.metrics["prod.cta_present"], true);
  assert.equal(parsed.metrics["color.dominant_hex"], "#c41e3a");
  assert.equal(parsed.metrics["color.contrast_punch"], 0.85);
  assert.equal(parsed.metrics["format.orientation"], "portrait");
  assert.equal(parsed.metrics["prod.primary_claim_guess"], "Claim line");
  assert.ok(parsed.filled_count >= 7);
  assert.ok(parsed.confidence >= 0.8);
});

test("facet + composition refine from craft metrics", () => {
  const metrics = {
    "tone.luxury": 0.92,
    "tone.editorial": 0.2,
    "comp.layout_family": "split-claim-media",
    "color.contrast_punch": 0.7,
    "color.saturation": 0.4,
    "color.chroma_count_feel": 0.2,
    "color.value_key": "dark",
    "color.mood_label": "crimson on charcoal",
    "comp.diagonal_energy": 0.2,
    "tone.calm": 0.75,
    "space.feel": "airy",
    "comp.focal_role": "product",
    "prod.cta_present": false,
    "risk.busy_center": 0.8,
    "color.dominant_hex": "#111111",
    "color.accent_hex": "#c41e3a"
  };
  const hints = designFacetHintsFromGraphicMetrics(metrics);
  assert.equal(hints.style, "luxury-dark");
  assert.equal(hints.layout, "split columns");
  assert.equal(hints.palette, "mono");
  assert.equal(hints.value_key, "dark");
  assert.equal(hints.composition_energy, "calm");

  const merged = mergeFacetsWithGraphicCraftHints(
    { style: "minimal", layout: "card grid", palette: null },
    metrics
  );
  assert.equal(merged.style, "luxury-dark");
  assert.equal(merged.layout, "split columns");
  assert.equal(merged.palette, "mono");

  const base = asCompositionContract({
    ...emptyCompositionContract(),
    focal: "claim",
    layoutFamily: "centered-lockup",
    negativeSpace: "balanced",
    avoid: []
  })!;
  const refined = refineCompositionFromCraftMetrics(base, metrics);
  assert.equal(refined.focal, "product");
  assert.equal(refined.layoutFamily, "split-claim-media");
  assert.equal(refined.negativeSpace, "airy");
  assert.equal(refined.ctaRole, "absent");
  assert.ok(refined.avoid.includes("busy-center"));
  assert.equal(refined.colorAxes.dominant, "#111111");
});

test("compactGraphicCraftBrief emits MCP rebuild literals without dumping 300 axes", () => {
  const brief = compactGraphicCraftBrief({
    schema_version: "0.1.0",
    graphic_craft_metrics_version: "0.3.0",
    generated_at: new Date().toISOString(),
    source_screenshot: "artboard.webp",
    model: "test",
    status: "complete",
    metric_count: 300,
    filled_count: 40,
    confidence: 0.91,
    metrics: {
      "comp.layout_family": "full-bleed-product",
      "comp.focal_role": "face",
      "format.orientation": "portrait",
      "format.aspect_family": "4:5",
      "color.dominant_hex": "#ff7f33",
      "color.ground_hex": "#1a1a1a",
      "color.accent_hex": "#ffffff",
      "tone.editorial": 0.82,
      "tone.luxury": 0.2,
      "risk.busy_center": 0.7,
      "prod.primary_claim_guess": "TRACK NUMBER 09",
      "prod.cta_present": false,
      "space.feel": "airy",
      "comp.balance": 0.74
    },
    measured: {},
    groups: { tone: 2, risk: 1 }
  });
  assert.ok(brief);
  assert.equal(brief!.literals["comp.layout_family"], "full-bleed-product");
  assert.equal(brief!.literals["color.dominant_hex"], "#ff7f33");
  assert.equal(brief!.tone_top[0]?.id, "tone.editorial");
  assert.equal(brief!.risks[0]?.id, "risk.busy_center");
  assert.ok(brief!.rebuild_directives.some((line) => /full-bleed-product/i.test(line)));
  assert.ok(brief!.rebuild_directives.some((line) => /TRACK NUMBER 09/i.test(line)));
  assert.ok(!("tone.editorial" in brief!.literals));
  assert.ok(JSON.stringify(brief).length < 4_000);
  assert.equal(compactGraphicCraftBrief(null), null);
});
