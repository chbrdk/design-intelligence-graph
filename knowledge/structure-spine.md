# Structure spine (2026-08-16)

Ordered **page bands** for rebuild — demotes thin `commerce · body` wrappers that clutter ontology dumps.

## Artifact

`derived/structure-spine.json` (`paths.json` → `structureSpine.relativePath`)

Written at capture from section compositions (desktop preferred); refreshed after LLM `section_look` / `vision_section` so beats include vision notes.

## Contents

| Field | Meaning |
| --- | --- |
| `page_arc` | `hero → feature → …` |
| `above_fold` | Ingredients (`media`/`brand`/`headline`/`cta`/`chrome`) + short recipe |
| `bands` | Promoted sections with zone, signature, beat |
| `demoted_count` | Thin wrappers removed from the spine |

## Demote rules (v1)

- `cookie_consent`
- Short thin `body`/`unknown` blocks
- `commerce`/`conversion`/`feedback` with bare `body` and no product/CTA cues
- Overconfident catalog matches on empty body text

## Rebuild brief

`## Structure spine` sits after design tokens, before page prose.

## Also

Enrichment now **always** refreshes `design_summary` via `pageSummaryFromMobbin` when section vision completes (not only on synthesize failure).

## Code

- `src/structure-spine.ts`
- Capture + `src/llm-enrich.ts`
- `src/rebuild-brief.ts`
- Tests: `test/structure-spine.test.ts`
