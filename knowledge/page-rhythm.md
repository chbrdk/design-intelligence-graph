# Page rhythm (structure contract for generators)

**Date:** 2026-08-17  
**Version:** `0.1.0`  
**Code:** [`src/page-rhythm.ts`](../src/page-rhythm.ts)  
**Spine:** [`structure-spine.md`](structure-spine.md)  
**Generate:** `generation_version` `0.4.0` (`src/look-conditioned-generation.ts`)

## Why

Look-contract binds **colors / type / radius / CTA**. Rebuilds still invent a card-kit hero. Page rhythm binds the **vertical order**: `page_arc`, above-fold recipe, compact bands, and structure `avoid[]`.

## Sources (first match)

1. `derived/structure-spine.json` (thin wrappers already demoted)
2. `derived/vision-layout.json` bands if spine is missing

Query keys / paths: `knowledge/paths.json` → `pageRhythm` + `structureSpine.relativePath`.

## Shape

| Field | Use |
|-------|-----|
| `page_arc` | `nav → hero → feature → footer` |
| `above_fold.ingredients` | `media` / `headline` / `cta` / `chrome` |
| `above_fold.height` | Opening share of the page (0–1) |
| `bands[]` | zone, category, signature, beat, normalized height |
| `avoid[]` | e.g. `card grid in the hero`, `feature grid inside the hero` |

`page_rhythm` **outranks** generic landing templates and LLM `proposed_signature` when bands exist.

## API

- Prompt pack: `page_rhythm` + `pageRhythmRules()` on `POST /api/library/analyses/:id/prompt-pack`
- Generate: blocks from band categories (`category_to_taxonomy` in `fixtures/design-references/look-conditioned-mapping.json`); constraints include `avoid:`
- Analysis package: `GET /api/library/analyses/:id` → `package.page_rhythm`
- Library detail shows **Page arc** on the design profile

## UI

`ScreenInsightStrip` metric `Page arc` from `package.page_rhythm.page_arc`.
