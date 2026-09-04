# Mobbin-parity LLM stages

Added 2026-08-15.

## Goal

Move DIG LLM analysis toward [Mobbin](https://mobbin.com)-style reference content:

- **Screens / screen patterns** (page archetype)
- **UI elements** (buttons, nav, cards, …)
- **Section recipes** (media → headline → gap → CTA)
- **Page narrative** (`page_flow` — ordered **sections within one page**; not DIG-011 multi-screen Flows)
- **Visual style** tokens interpreted as design language

Multi-screen user journeys are specified separately in [`docs/DIG-011-user-flow-graph.md`](../docs/DIG-011-user-flow-graph.md). Do not call `page_flow` a “user flow.” Goal challenge: [`dig-011-challenge.md`](dig-011-challenge.md).

Not a Mobbin clone yet — we generate structured evidence from captures, then enrich with small sequential LLM calls.

Taxonomy gap inventory (closed screen patterns + flow actions without Mobbin content): [`mobbin-parity-taxonomy-gaps.md`](mobbin-parity-taxonomy-gaps.md).

## Why staged prompts

One giant prompt timed out on Apple-scale pages (~70k tokens). Smaller steps:

1. Keep each prefill tiny (only the evidence slice that stage needs)
2. Fail soft per stage (continue with partial results)
3. Produce searchable fields Mobbin users expect

Config: [`paths.json`](paths.json) → `llm.stagedAnalysis`, `llm.stageMaxTokens`, `llm.parityTarget`.

## Stage order

1. `screen_patterns` — page/screen archetype labels
2. `ui_elements` — notable UI elements from ontology
3. `section_recipes` — interpret measured signatures/gaps
4. `visual_style` — fonts/colors/shape → style labels
5. `synthesize` — short summary + 3–8 hypotheses from prior stage JSON only

Implementation: `src/llm-stages.ts` → used by `analyzeDesignWithLlm`.

## Scaling

Mobbin-class libraries need far more than one model call per page. See [`llm-scaling-mobbin.md`](llm-scaling-mobbin.md) for tiered models (Qwen bulk / Luna quality), async queues, stage caching, and cost sketches. Role defaults: `knowledge/paths.json` → `llm.scaling.roles`.
