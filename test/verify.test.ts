import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeArtifact } from "../src/io.js";
import type { CaptureManifest } from "../src/types.js";
import { verifyCapturePackage } from "../src/verify.js";
import { evaluateQuality, ZERO_QUALITY_METRICS } from "../src/quality.js";

async function createPackage(): Promise<{ root: string; manifest: CaptureManifest }> {
  const root = await mkdtemp(join(tmpdir(), "dig-verify-"));
  const quality = await writeArtifact(root, "quality.json", JSON.stringify({ overall: 1 }), "application/json");
  const nodes = await writeArtifact(root, "viewports/mobile/dom/nodes.jsonl", '{"node_id":"node_1"}\n', "application/x-ndjson");
  const manifest: CaptureManifest = {
    schema_version: "0.1.0", capture_run_id: "cap_1234567890abcdef1234567890abcdef",
    started_at: "2026-08-14T00:00:00.000Z", completed_at: "2026-08-14T00:00:01.000Z",
    requested_url: "https://example.com", canonical_url: "https://example.com",
    site: { site_id: "site_test", domain: "example.com", scheme: "https", canonical_origin: "https://example.com" },
    page: { page_id: "pg_test", site_id: "site_test", url: "https://example.com", canonical_url: "https://example.com", route: "/" },
    crawler: { name: "dig-capture", version: "0.1.0" },
    browser: { engine: "chromium", version: "1", user_agent: "test", locale: "en-US", timezone: "UTC" },
    environment: { prefers_color_scheme: "light", prefers_reduced_motion: false, forced_colors: false, touch: false, pointer: "fine", hover: true },
    capture_dimensions: { locale: "en-US", market: "unknown", theme: "light", consent_state: "unknown", authentication_state: "unauthenticated", personalization: "unknown", experiments: [] },
    policy: { authorization_basis: "user_initiated_public_capture", robots_decision: "not_evaluated_interactive_capture", retention_class: "unspecified", redistribution_class: "structural_evidence_only" },
    status: "complete", capture_status: { dom: "complete" }, run_artifacts: { quality },
    viewport_captures: [{
      viewport_capture_id: "vpc_1234567890abcdef1234567890abcdef", name: "mobile",
      viewport: { width: 390, height: 844, device_scale_factor: 1 }, document: { width: 390, height: 844 },
      final_url: "https://example.com", title: "Test", started_at: "2026-08-14T00:00:00.000Z",
      completed_at: "2026-08-14T00:00:01.000Z", status: "complete", node_count: 1,
      visible_node_count: 1, text_line_count: 0, artifacts: { nodes }, warnings: [],
      quality: evaluateQuality({ ...ZERO_QUALITY_METRICS, subsystem_success: 1 })
    }],
    interventions: [], errors: []
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { root, manifest };
}

test("accepts an intact capture package", async () => {
  const { root } = await createPackage();
  const report = await verifyCapturePackage(root);
  assert.equal(report.valid, true);
  assert.equal(report.checked_artifacts, 2);
  assert.deepEqual(report.issues, []);
});

test("detects tampered artifact bytes", async () => {
  const { root } = await createPackage();
  await writeFile(join(root, "quality.json"), JSON.stringify({ overall: 0 }));
  const report = await verifyCapturePackage(root);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.code === "artifact_hash_mismatch"));
});

test("rejects artifact paths outside the package", async () => {
  const { root, manifest } = await createPackage();
  manifest.run_artifacts.quality!.path = "../quality.json";
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const report = await verifyCapturePackage(root);
  assert.ok(report.issues.some((issue) => issue.code === "artifact_path_escape"));
});

test("detects invalid JSON Lines even with matching integrity metadata", async () => {
  const { root, manifest } = await createPackage();
  manifest.viewport_captures[0]!.artifacts.nodes = await writeArtifact(
    root, "viewports/mobile/dom/nodes.jsonl", "{invalid}\n", "application/x-ndjson"
  );
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const report = await verifyCapturePackage(root);
  assert.ok(report.issues.some((issue) => issue.code === "invalid_serialized_content"));
});

test("detects broken node parent references", async () => {
  const { root, manifest } = await createPackage();
  manifest.viewport_captures[0]!.artifacts.nodes = await writeArtifact(
    root, "viewports/mobile/dom/nodes.jsonl", '{"node_id":"node_1","parent_node_id":"missing"}\n', "application/x-ndjson"
  );
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const report = await verifyCapturePackage(root);
  assert.ok(report.issues.some((issue) => issue.code === "node_parent_missing"));
});

test("detects duplicate viewport identities", async () => {
  const { root, manifest } = await createPackage();
  manifest.viewport_captures.push({ ...manifest.viewport_captures[0]!, artifacts: {} });
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const report = await verifyCapturePackage(root);
  assert.ok(report.issues.some((issue) => issue.code === "duplicate_viewport_id"));
  assert.ok(report.issues.some((issue) => issue.code === "duplicate_viewport_name"));
});

test("detects invalid DIG-002 ontology references", async () => {
  const { root, manifest } = await createPackage();
  manifest.run_artifacts.ontology = await writeArtifact(root, "derived/ontology.json", JSON.stringify({
    ontology_version: "0.2.0",
    viewports: [{
      viewport_capture_id: manifest.viewport_captures[0]!.viewport_capture_id,
      page_entity_id: "ont_page",
      entities: [
        { ontology_entity_id: "ont_page", taxonomy_id: "dig:page.content", source_node_id: null, parent_entity_id: null, confidence: 0.7, layer: "L3", method: "test" },
        { ontology_entity_id: "ont_bad", taxonomy_id: "dig:component.button", source_node_id: "missing", parent_entity_id: "ont_page", confidence: 1, layer: "L2", method: "test" }
      ],
      relationships: [{ relationship_id: "rel_bad", from_entity_id: "ont_page", to_entity_id: "missing" }]
    }]
  }), "application/json");
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  const report = await verifyCapturePackage(root);
  assert.ok(report.issues.some((issue) => issue.code === "ontology_source_node_missing"));
  assert.ok(report.issues.some((issue) => issue.code === "ontology_relationship_endpoint_missing"));
});
