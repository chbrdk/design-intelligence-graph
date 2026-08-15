import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  CAPTURE_LIMITS,
  boundUtf8Text,
  matchedStyleNodeCap,
  matchedStylesMode
} from "../src/capture-limits.js";
import {
  compactMatchedStyleEntry,
  toEssentialMatchedStyleEntry
} from "../src/matched-styles-compact.js";

function bulkyMatchedEntry() {
  const matchedRules = Array.from({ length: 50 }, (_, index) => ({
    matchingSelectors: [`#a${index}`, `#b${index}`, `#c${index}`],
    rule: {
      selectorList: { text: `.rule-${index}` },
      origin: "regular",
      style: {
        cssText: "color: red; ".repeat(200),
        cssProperties: [
          { name: "color", value: "red" },
          { name: "font-size", value: "16px" },
          { name: "display", value: "flex" },
          ...Array.from({ length: 100 }, (__, propIndex) => ({
            name: `--p${propIndex}`,
            value: "1"
          }))
        ],
        shorthandEntries: Array.from({ length: 60 }, (__, shortIndex) => ({
          name: `s${shortIndex}`,
          value: "0"
        }))
      }
    }
  }));
  return {
    node_id: "n1",
    matched_rules: matchedRules,
    inherited: Array.from({ length: 40 }, () => ({
      inlineStyle: { cssProperties: [{ name: "color", value: "black" }] },
      matchedCSSRules: matchedRules.slice(0, 20)
    })),
    pseudo_elements: [{ pseudoType: "before", matches: matchedRules.slice(0, 5) }],
    provenance: { layer: "L1", method: "cdp_get_matched_styles", confidence: 1 }
  };
}

test("CAPTURE_LIMITS mirror knowledge/paths.json captureLimits", async () => {
  const documented = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")).captureLimits as {
    maxHtmlBytes: number;
    omitStylesheetCssText: boolean;
    maxStylesheetRuleCssTextChars: number;
    maxMatchedStyleNodes: number;
    maxMatchedRulesPerNode: number;
    maxInheritedEntriesPerNode: number;
    matchedStylesMode: string;
    compactMaxMatchedStyleNodes: number;
    compactMaxMatchedRulesPerNode: number;
    compactMaxInheritedEntriesPerNode: number;
  };
  assert.equal(CAPTURE_LIMITS.maxHtmlBytes, documented.maxHtmlBytes);
  assert.equal(CAPTURE_LIMITS.maxMatchedStyleNodes, documented.maxMatchedStyleNodes);
  assert.equal(CAPTURE_LIMITS.maxMatchedRulesPerNode, documented.maxMatchedRulesPerNode);
  assert.equal(CAPTURE_LIMITS.maxInheritedEntriesPerNode, documented.maxInheritedEntriesPerNode);
  assert.equal(CAPTURE_LIMITS.maxStylesheetRuleCssTextChars, documented.maxStylesheetRuleCssTextChars);
  assert.equal(CAPTURE_LIMITS.omitStylesheetCssText, documented.omitStylesheetCssText);
  assert.equal(CAPTURE_LIMITS.matchedStylesMode, documented.matchedStylesMode);
  assert.equal(CAPTURE_LIMITS.compactMaxMatchedStyleNodes, documented.compactMaxMatchedStyleNodes);
  assert.equal(CAPTURE_LIMITS.compactMaxMatchedRulesPerNode, documented.compactMaxMatchedRulesPerNode);
  assert.equal(CAPTURE_LIMITS.compactMaxInheritedEntriesPerNode, documented.compactMaxInheritedEntriesPerNode);
  assert.equal(matchedStylesMode(), "essential");
  assert.equal(matchedStyleNodeCap(), documented.maxMatchedStyleNodes);
});

test("boundUtf8Text leaves small strings alone", () => {
  const result = boundUtf8Text("hello", 100, "html");
  assert.equal(result.truncated, false);
  assert.equal(result.value, "hello");
});

test("boundUtf8Text truncates oversized UTF-8 payloads", () => {
  const value = "ä".repeat(5_000);
  const result = boundUtf8Text(value, 100, "source_html");
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.value, "utf8") <= 100 + 120);
  assert.match(result.value, /dig:truncated source_html/);
});

test("compactMatchedStyleEntry caps rules and drops bulky fields", () => {
  const compacted = compactMatchedStyleEntry(bulkyMatchedEntry()) as {
    matched_rules: unknown[];
    inherited: unknown[];
    node_id: string;
  };

  assert.equal(compacted.node_id, "n1");
  assert.equal(compacted.matched_rules.length, CAPTURE_LIMITS.compactMaxMatchedRulesPerNode);
  assert.equal(compacted.inherited.length, CAPTURE_LIMITS.compactMaxInheritedEntriesPerNode);
  const first = compacted.matched_rules[0] as {
    rule?: { style?: { cssText?: string; cssProperties?: unknown[]; shorthandEntries?: unknown[] } };
  };
  assert.equal(first.rule?.style?.cssText, undefined);
  assert.ok((first.rule?.style?.cssProperties?.length ?? 0) <= 80);
});

test("toEssentialMatchedStyleEntry is much smaller than compact and keep allowlisted props", () => {
  const entry = bulkyMatchedEntry();
  const compact = compactMatchedStyleEntry(entry);
  const essential = toEssentialMatchedStyleEntry(entry);
  const compactBytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
  const essentialBytes = Buffer.byteLength(JSON.stringify(essential), "utf8");
  assert.ok(essentialBytes < compactBytes / 5, `essential ${essentialBytes} vs compact ${compactBytes}`);
  assert.equal(essential.node_id, "n1");
  assert.equal(essential.props.color, "red");
  assert.equal(essential.props["font-size"], "16px");
  assert.equal(essential.props.display, "flex");
  assert.equal(essential.props["--p0"], undefined);
  assert.ok(!("inherited" in essential));
  assert.ok(!("pseudo_elements" in essential));
  assert.ok(essential.selectors.length > 0);
});
