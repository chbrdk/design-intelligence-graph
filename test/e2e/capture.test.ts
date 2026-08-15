import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { capture } from "../../src/capture.js";
import { verifyCapturePackage } from "../../src/verify.js";

test("captures and verifies the deterministic fixture end to end", { timeout: 120_000 }, async () => {
  const fixtureRoot = resolve("examples/fixture");
  const server = createServer(async (request, response) => {
    const path = request.url?.startsWith("/fixture.css") ? "fixture.css" : "index.html";
    response.setHeader("content-type", path.endsWith(".css") ? "text/css" : "text/html");
    response.end(await readFile(join(fixtureRoot, path)));
  });
  await new Promise<void>((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const outputDirectory = await mkdtemp(join(tmpdir(), "dig-e2e-"));
    const result = await capture({
      url: `http://127.0.0.1:${address.port}/?secret=test-value`,
      outputDirectory,
      viewports: [
        { name: "test-mobile", width: 390, height: 844, deviceScaleFactor: 1 },
        { name: "test-desktop", width: 1000, height: 700, deviceScaleFactor: 1 }
      ],
      timeoutMs: 10_000,
      settleMs: 100,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "no-preference",
      headed: false
    });
    assert.equal(result.manifest.status, "complete", JSON.stringify({ errors: result.manifest.errors, viewports: result.manifest.viewport_captures.map((item) => item.warnings) }));
    assert.ok(result.manifest.viewport_captures.every((viewport) => viewport.quality.rating === "excellent"));
    const verification = await verifyCapturePackage(result.packageRoot);
    assert.equal(verification.valid, true, JSON.stringify(verification.issues));
    assert.ok(verification.checked_artifacts >= 20);
    const packageBytes = await readFile(join(result.packageRoot, "manifest.json"), "utf8");
    assert.doesNotMatch(packageBytes, /test-value/);
    const layout = JSON.parse(await readFile(join(result.packageRoot, "derived/layout-analysis.json"), "utf8")) as { viewports: unknown[] };
    assert.equal(layout.viewports.length, 2);
    const logical = JSON.parse(await readFile(join(result.packageRoot, "derived/logical-elements.json"), "utf8")) as { logical_element_count: number };
    assert.ok(logical.logical_element_count > 0);
    const ontology = JSON.parse(await readFile(join(result.packageRoot, "derived/ontology.json"), "utf8")) as {
      viewports: Array<{ entities: Array<{ taxonomy_id: string; logical_element_id?: string }> }>;
    };
    assert.equal(ontology.viewports.length, 2);
    assert.ok(ontology.viewports.every((viewport) => viewport.entities.some((entity) => entity.taxonomy_id === "dig:pattern.hero")));
    assert.ok(ontology.viewports.some((viewport) => viewport.entities.some((entity) => entity.logical_element_id)));
    const geometryLayout = JSON.parse(await readFile(join(result.packageRoot, "derived/geometry-layout.json"), "utf8")) as {
      geometry_model_version: string; viewports: Array<{ layout_containers: unknown[]; spatial_relationships: unknown[] }>;
    };
    assert.equal(geometryLayout.geometry_model_version, "0.1.0");
    assert.equal(geometryLayout.viewports.length, 2);
    assert.ok(geometryLayout.viewports.every((viewport) => Array.isArray(viewport.spatial_relationships)));
    const responsiveGraph = JSON.parse(await readFile(join(result.packageRoot, "derived/responsive-layout-graph.json"), "utf8")) as {
      geometry_model_version: string; nodes: unknown[]; edges: unknown[];
    };
    assert.equal(responsiveGraph.geometry_model_version, "0.1.0");
    assert.ok(responsiveGraph.nodes.length > 0);
    assert.ok(Array.isArray(responsiveGraph.edges));
    const visualLanguage = JSON.parse(await readFile(join(result.packageRoot, "derived/visual-language.json"), "utf8")) as {
      visual_language_version: string; viewports: unknown[]; hypotheses: Array<{ layer: string; confidence: number }>;
    };
    assert.equal(visualLanguage.visual_language_version, "0.1.0");
    assert.equal(visualLanguage.viewports.length, 2);
    assert.ok(visualLanguage.hypotheses.every((hypothesis) => hypothesis.layer === "L3" && hypothesis.confidence < 1));
    const analysis = JSON.parse(await readFile(join(result.packageRoot, "derived/analysis-report.json"), "utf8")) as {
      analysis_pipeline_version: string; stages: Array<{ kind: string; status: string }>; findings: unknown[];
    };
    assert.equal(analysis.analysis_pipeline_version, "0.1.0");
    assert.equal(analysis.stages.find((stage) => stage.kind === "vision")?.status, "not_attempted");
    assert.ok(analysis.findings.length >= 3);
  } finally {
    await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
  }
});
