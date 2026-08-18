import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  designReferenceFromSectionLook,
  emitDesignReferencesForPackage
} from "../src/design-reference-emit.js";
import { runDesignReferenceEval } from "../src/design-reference-eval.js";
import { validateAgainstSchema } from "../src/flow-schema-validate.js";

test("design-reference eval scores R1/R2/R4 overall high on hero scenario", async () => {
  const result = await runDesignReferenceEval();
  assert.equal(result.scenario_id, "design-reference-hero");
  const byId = Object.fromEntries(result.tracks.map((track) => [track.id, track]));
  assert.equal(byId.R1?.score, 100);
  assert.ok((byId.R2?.score ?? 0) >= 80);
  assert.ok((byId.R4?.score ?? 0) >= 80);
  assert.ok(result.overall >= 80);
});

test("emit DesignReference from section_look validates and writes jsonl", async () => {
  const reference = designReferenceFromSectionLook({
    captureRunId: "run_test_emit",
    description: {
      section_id: "sec_hero_0",
      signature: "media>heading>cta",
      category: "hero",
      stack_summary: "media → heading → cta",
      look_summary:
        "Minimalist product hero with full-bleed photo, soft dark gradient scrim, centered CTA.",
      confidence: 0.9,
      evidence_refs: ["sec_hero_0"],
      overlay: { present: true, kind: "scrim" },
      alignment: { text: "center", cta: "center" }
    },
    screenPatterns: ["marketing", "hero"],
    visualStyleLabels: ["clean"],
    designSummary: "Test hero page"
  });
  assert.equal(validateAgainstSchema("designReference", reference).length, 0);
  assert.equal(reference.craft?.type_scale, "medium");
  assert.equal(reference.craft?.contrast_mode, "mixed");

  const root = await mkdtemp(join(tmpdir(), "dig-ref-emit-"));
  await mkdir(join(root, "derived"), { recursive: true });
  const llm = {
    schema_version: "0.1.0",
    llm_design_version: "0.2.0",
    generated_at: new Date().toISOString(),
    model: "test",
    base_url: "http://127.0.0.1",
    status: "complete",
    design_summary: "Test hero page",
    hypotheses: [],
    mobbin: {
      screen_patterns: [{ name: "marketing", confidence: 0.8, evidence_refs: [] }],
      ui_elements: [],
      recipe_insights: [],
      page_flow: [],
      visual_style_labels: [{ name: "clean", confidence: 0.7, evidence_refs: [] }],
      section_descriptions: [
        {
          section_id: "sec_hero_0",
          signature: "media>heading>cta",
          category: "hero",
          stack_summary: "media → heading → cta",
          look_summary:
            "Minimalist product hero with full-bleed photo, soft dark gradient scrim, centered CTA.",
          confidence: 0.9,
          evidence_refs: ["sec_hero_0"],
          overlay: { present: true, kind: "scrim" },
          alignment: { text: "center", cta: "center" }
        }
      ]
    }
  };
  await writeFile(join(root, "derived/llm-design.json"), JSON.stringify(llm), "utf8");
  await writeFile(
    join(root, "manifest.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      capture_run_id: "run_test_emit",
      status: "complete",
      site: { site_id: "site_x", domain: "example.com" },
      page: { page_id: "page_x", route: "/" },
      viewport_captures: [{ viewport_capture_id: "vpc_desktop", name: "desktop", status: "complete" }],
      run_artifacts: {
        llm_design: {
          path: "derived/llm-design.json",
          sha256: "a".repeat(64),
          bytes: 1,
          media_type: "application/json"
        }
      }
    }),
    "utf8"
  );

  const emitted = await emitDesignReferencesForPackage(root);
  assert.equal(emitted.count, 1);
  const lines = (await readFile(join(root, emitted.path), "utf8")).trim().split("\n");
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]!);
  assert.equal(validateAgainstSchema("designReference", parsed).length, 0);
  assert.match(parsed.reference_id, /^ref_sec_hero_0_/);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  assert.ok(manifest.run_artifacts.design_references?.path);
  assert.ok(manifest.run_artifacts.design_reference_embeddings?.path);
  const embLines = (await readFile(join(root, "derived/design-references.embeddings.jsonl"), "utf8"))
    .trim()
    .split("\n");
  assert.equal(embLines.length, 1);
  const emb = JSON.parse(embLines[0]!);
  assert.equal(emb.provider, "dig-hashing-v1");
  assert.equal(emb.dims, 384);
});

test("emit falls back to screen DesignReference when section_look is empty", async () => {
  const { designReferencesFromLlmAnalysis } = await import("../src/design-reference-emit.js");
  const refs = designReferencesFromLlmAnalysis(
    "cap_sparse",
    {
      schema_version: "0.1.0",
      llm_design_version: "0.2.0",
      generated_at: new Date().toISOString(),
      model: "test",
      base_url: "http://127.0.0.1",
      status: "complete",
      design_summary: "Minimalist content layout with high-contrast monochrome styling.",
      hypotheses: [],
      mobbin: {
        screen_patterns: [{ name: "content", confidence: 0.8, evidence_refs: [] }],
        ui_elements: [],
        recipe_insights: [],
        page_flow: [],
        visual_style_labels: [{ name: "minimal", confidence: 0.7, evidence_refs: [] }],
        section_descriptions: []
      }
    } as import("../src/llm-design.js").LlmDesignAnalysis,
    "vpc_desktop"
  );
  assert.equal(refs.length, 1);
  assert.equal(refs[0]!.scope, "screen");
  assert.equal(validateAgainstSchema("designReference", refs[0]!).length, 0);
  assert.equal(refs[0]!.craft?.contrast_mode, "monochrome");
});
