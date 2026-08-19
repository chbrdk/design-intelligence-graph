import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModuleEmbeddingCanonical,
  buildScreenEmbeddingCanonical,
  canonicalOmitsIdentity
} from "../src/dense-embedding-canonical.js";
import { loadDigPaths } from "../src/runtime-paths.js";

test("dense embedding paths stay a separate 1024-d OpenRouter model", () => {
  const dense = loadDigPaths().embeddings?.dense;
  assert.equal(dense?.status, "live");
  assert.equal(dense?.provider, "openrouter");
  assert.equal(dense?.model, "qwen/qwen3-embedding-8b");
  assert.equal(dense?.evalModel, "qwen/qwen3-embedding-0.6b");
  assert.equal(dense?.dims, 1024);
  assert.equal(dense?.table, "dense_embeddings");
  assert.deepEqual(dense?.subjects, ["screen", "module", "design_reference"]);
  assert.notEqual(dense?.dims, loadDigPaths().embeddings?.dims);
  assert.notEqual(dense?.model, loadDigPaths().embeddings?.model);
});

test("screen canonical is ordered craft text without identity", () => {
  const text = buildScreenEmbeddingCanonical({
    industry: "Insurance",
    style: "Minimal",
    layout: "Full-bleed stacks",
    craft_tags: ["editorial_type", "low_imagery"],
    imagery_density: "low",
    type_scale: "monumental",
    type_image_mode: "overlap",
    contrast_mode: "monochrome",
    composition_energy: "calm",
    chrome_weight: "minimal",
    look_summary: "Large type over a quiet photographic field.",
    rhythm_summary: "Hero then proof then contact.",
    module_signatures: ["brand_hero", "stats_column"]
  });
  assert.match(text, /^kind:screen\nindustry:insurance\nstyle:minimal\nlayout:full-bleed stacks/);
  assert.match(text, /craft:editorial_type low_imagery/);
  assert.match(text, /imagery:low/);
  assert.match(text, /type:monumental overlap/);
  assert.match(text, /contrast:monochrome/);
  assert.match(text, /chrome:minimal/);
  assert.match(text, /modules:brand_hero stats_column/);
  assert.equal(canonicalOmitsIdentity(text), true);
});

test("screen canonical strips urls and capture ids from look prose", () => {
  const text = buildScreenEmbeddingCanonical({
    look_summary: "Quiet type. See https://www.example.com/ and cap_deadbeef01234567 later."
  });
  assert.match(text, /look:quiet type\. see and later\./);
  assert.equal(canonicalOmitsIdentity(text), true);
});

test("module canonical skips empty craft and truncates look", () => {
  const text = buildModuleEmbeddingCanonical({
    category: "Hero",
    signature: "Brand Hero",
    contrast_mode: "monochrome",
    look_summary: "A".repeat(4000)
  });
  assert.match(text, /^kind:module\ncategory:hero\nsignature:brand hero/);
  assert.ok(text.length <= 1500);
  assert.ok(text.includes("look:"));
});
