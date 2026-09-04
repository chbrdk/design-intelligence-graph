import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  SCREEN_PATTERNS_VERSION,
  getScreenPatternsCatalog,
  listScreenPatterns,
  normalizeScreenPatternLabel,
  normalizeScreenPatternLabels,
  screenPatternFilterCatalog
} from "../src/screen-patterns.js";
import { screenFacetsMatch } from "../src/design-facets.js";

test("screen-patterns catalog version matches paths.json", async () => {
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    taxonomy?: { screenPatternsCatalog?: string; screenPatternsVersion?: string };
  };
  assert.equal(paths.taxonomy?.screenPatternsCatalog, "knowledge/screen-patterns-catalog.json");
  assert.equal(paths.taxonomy?.screenPatternsVersion, SCREEN_PATTERNS_VERSION);
  assert.equal(getScreenPatternsCatalog().version, SCREEN_PATTERNS_VERSION);
});

test("screen-patterns catalog has unique dig:screen.* ids", () => {
  const patterns = listScreenPatterns();
  assert.ok(patterns.length >= 15);
  const ids = new Set(patterns.map((item) => item.id));
  assert.equal(ids.size, patterns.length);
  for (const pattern of patterns) {
    assert.match(pattern.id, /^dig:screen\./);
    assert.ok(pattern.label.length > 0);
  }
  assert.ok(screenPatternFilterCatalog().includes("Login"));
  assert.ok(!screenPatternFilterCatalog().includes("Unknown screen"));
});

test("normalizeScreenPatternLabel maps aliases and avoids short substring traps", () => {
  assert.equal(normalizeScreenPatternLabel("sign in"), "Login");
  assert.equal(normalizeScreenPatternLabel("Marketing Home"), "Marketing home");
  assert.equal(normalizeScreenPatternLabel("empty state"), "Empty state");
  assert.equal(normalizeScreenPatternLabel("minimal login dashboard"), "Login");
  assert.equal(normalizeScreenPatternLabel("purchase matching flow"), null);
  assert.deepEqual(normalizeScreenPatternLabels(["welcome", "pricing page", "welcome"]), [
    "Onboarding",
    "Pricing"
  ]);
});

test("screenFacetsMatch filters on closed screen_pattern", () => {
  const summary = {
    page_type: null,
    style: null,
    layout: null,
    industry_tags: [],
    screen_patterns: ["Login", "Settings"]
  };
  assert.equal(screenFacetsMatch(summary, { screen_pattern: "login" }), true);
  assert.equal(screenFacetsMatch(summary, { screen_pattern: "Dashboard" }), false);
});
