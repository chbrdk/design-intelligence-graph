# DIG-010 — Section look & feel (page scan → per-section tasks)

Status: implemented 2026-08-15  
Spec companion: [`knowledge/section-look.md`](../knowledge/section-look.md)

## Goal

After the page-level Mobbin facet stages, run **budgeted per-section LLM tasks** that describe how each section is built and feels (scrim, shadow, italic highlight, centered CTA, background media).

## Pipeline

1. Wave A (parallel): `screen_patterns` | `ui_elements` | `section_recipes` | `visual_style`
2. Wave B (parallel, capped): `section_look` × N measured sections (default 8 via `llm.scaling.sectionLookMaxSections` / `DIG_LLM_SECTION_LOOK_MAX`)
3. Wave C: `synthesize` (includes section look summaries)
4. Wave D: `vision_screen`

Evidence for Wave B joins `SectionComposition` recipes to allowlisted computed CSS (`background-image`, `box-shadow`, `font-style`, align, …).

## Artifacts / index

- Written into `derived/llm-design.json` → `mobbin.section_descriptions[]`
- Indexed as `llm_items.kind = 'section_look'` (migration `007`)
- Library API exposes package `section_descriptions` + grouped items
- UI Analyses / screen detail: **Section look & feel** block

## Tests

- `test/section-look.test.ts`
- Existing staged/parallel LLM tests (Wave B no-ops when no sections)
