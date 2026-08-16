# Synthesize harden + rebuild brief (2026-08-16)

## Problem

Porsche enrichment: `synthesize` failed with truncated JSON (`Expected ',' or ']'…`). Soft-complete fell back to a technical `pageSummaryFromMobbin` (“Page flow leans… Key bands: … object-fit…”), and `vision_section` runs **after** synthesize so VL beats never informed the page summary.

## Fixes

1. `src/json-repair.ts` — loose extract + truncate close + summary skeleton recovery
2. Compact `section_look_beats` evidence + 900 token synthesize budget
3. Editorial `pageSummaryFromMobbin` (vision beats, no CSS echo); detect soft echo
4. After section/page vision: refresh `design_summary` when synthesize failed or echo
5. `derived/rebuild-brief.md` via `src/rebuild-brief.ts` during enrich
6. `derived/design-tokens.json` from visual-language (capture-time); brief leads with **Design tokens (measured)** — see `knowledge/design-tokens.md`

## Smoke

Re-capture Porsche; expect `synthesize` complete **or** refreshed editorial summary + `rebuild_brief` artifact.
