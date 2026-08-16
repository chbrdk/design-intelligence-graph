import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyChromeTrigger,
  isChromeIaNoiseLabel,
  preferNewChromeLabels,
  rankChromeCandidates,
  type ChromeStateCandidate
} from "../src/chrome-states.js";
import { buildRebuildBriefMarkdown } from "../src/rebuild-brief.js";

test("preferNewChromeLabels drops footer noise and keeps fresh IA", () => {
  const before = ["Menü", "Porsche.com"];
  const after = [
    "Menü",
    "Porsche.com",
    "Modelle",
    "Händler",
    "Service & Zubehör",
    "Hinweise zum Datenschutz.",
    "Impressum und Rechtliche Hinweise."
  ];
  assert.deepEqual(preferNewChromeLabels(before, after), ["Modelle", "Händler", "Service & Zubehör"]);
  assert.equal(isChromeIaNoiseLabel("EU Data Act."), true);
});

test("classifyChromeTrigger maps nav/search/cart/account siblings", () => {
  assert.equal(classifyChromeTrigger({ text: "Modelle", role: "button", expanded: "false" }), "nav_menu");
  assert.equal(classifyChromeTrigger({ text: "Menu", role: "button", ariaLabel: "Open menu" }), "mobile_nav");
  assert.equal(classifyChromeTrigger({ text: "Menü", tag: "button", haspopup: "dialog" }), "mobile_nav");
  assert.equal(classifyChromeTrigger({ text: "", ariaLabel: "open the my porsche menu", tag: "button" }), "account_drawer");
  assert.equal(classifyChromeTrigger({ text: "Suche", ariaLabel: "Search" }), "search_overlay");
  assert.equal(classifyChromeTrigger({ text: "Warenkorb" }), "cart_drawer");
  assert.equal(classifyChromeTrigger({ text: "Anmelden" }), "account_drawer");
  assert.equal(classifyChromeTrigger({ text: "Land oder Region ändern" }), "lang_switcher");
  assert.equal(classifyChromeTrigger({ text: "Deutschland", ariaLabel: "Language" }), "lang_switcher");
  assert.equal(classifyChromeTrigger({ text: "Filter" }), "filter_drawer");
  assert.equal(classifyChromeTrigger({ text: "FAQ", tag: "summary" }), "accordion");
  assert.equal(classifyChromeTrigger({ text: "Alle akzeptieren" }), null);
});

test("rankChromeCandidates keeps one per kind and respects budget", () => {
  const candidates: ChromeStateCandidate[] = [
    { kind: "nav_menu", selector: "a", label: "Modelle", trigger: "hover", score: 0.9 },
    { kind: "nav_menu", selector: "b", label: "Shop", trigger: "hover", score: 0.8 },
    { kind: "search_overlay", selector: "c", label: "Suche", trigger: "click", score: 0.85 },
    { kind: "cart_drawer", selector: "d", label: "Cart", trigger: "click", score: 0.7 },
    { kind: "accordion", selector: "e", label: "FAQ", trigger: "click", score: 0.6 }
  ];
  const ranked = rankChromeCandidates(candidates, 3);
  assert.deepEqual(
    ranked.map((item) => item.kind),
    ["nav_menu", "search_overlay", "cart_drawer"]
  );
  assert.equal(ranked[0]?.label, "Modelle");
});

test("rebuild brief includes chrome IA section", () => {
  const md = buildRebuildBriefMarkdown({
    captureRunId: "cap_x",
    url: "https://example.com",
    llm: {
      schema_version: "0.1.0",
      llm_design_version: "0.2.0",
      generated_at: new Date().toISOString(),
      model: "test",
      base_url: "http://local",
      status: "complete",
      design_summary: "Marketing homepage with media-led hero storytelling for rebuild tests.",
      hypotheses: [],
      mobbin: {
        screen_patterns: [],
        ui_elements: [],
        recipe_insights: [],
        page_flow: [],
        visual_style_labels: [],
        section_descriptions: []
      }
    },
    chromeStates: [
      {
        kind: "nav_menu",
        label: "Modelle",
        open_labels: ["911", "Taycan", "Cayenne"]
      }
    ]
  });
  assert.match(md, /Chrome IA/);
  assert.match(md, /nav_menu/);
  assert.match(md, /Taycan/);
});
