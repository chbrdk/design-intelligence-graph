import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { getCatalogEntries, isTaxonomyId, ONTOLOGY_VERSION, TAXONOMY } from "../src/taxonomy.js";

test("ontology version is 0.2.0 and mirrors knowledge paths", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    taxonomy?: { ontologyVersion?: string; sectionComponentCatalog?: string };
  };
  assert.equal(ONTOLOGY_VERSION, "0.2.0");
  assert.equal(paths.taxonomy?.ontologyVersion, ONTOLOGY_VERSION);
  assert.equal(paths.taxonomy?.sectionComponentCatalog, "knowledge/section-component-catalog.json");
});

test("section component catalog has ~500 unique dig: ids", () => {
  const entries = getCatalogEntries();
  assert.ok(entries.length >= 480 && entries.length <= 520, `expected ~500 entries, got ${entries.length}`);
  const ids = new Set(entries.map((entry) => entry.id));
  assert.equal(ids.size, entries.length);
  for (const entry of entries) {
    assert.match(entry.id, /^dig:/);
    assert.ok(entry.label.length > 0);
    assert.ok(entry.category.length > 0);
    assert.ok(["section", "component", "pattern", "content", "region", "element", "page"].includes(entry.entity_type));
  }
});

test("merged TAXONOMY includes core and catalog terms", () => {
  assert.ok(isTaxonomyId("dig:pattern.hero"));
  assert.ok(isTaxonomyId("dig:section.hero_media_above"));
  assert.ok(isTaxonomyId("dig:section.content_block"));
  assert.equal(TAXONOMY["dig:section.hero_media_above"]?.category, "hero");
  assert.ok((TAXONOMY["dig:section.hero_media_above"]?.composition_hints?.length ?? 0) >= 1);
});
