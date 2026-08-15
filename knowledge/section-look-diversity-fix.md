# Section look diversity / social_proof overmatch (2026-08-15)

## Symptom

Analyses showed many nearly identical `social_proof · media` section_look rows (e.g. Porsche homepage).

## Causes

1. Catalog hint `dig:section.logo_marquee` was `["media"]` — matched every media-only band.
2. Hero heuristic required measured heading; overlay text on full-bleed heroes often missing from recipes.
3. `selectSectionsForLook` filled the budget with same category/signature.
4. LLM echoed page-level style labels into every look_summary.

## Fixes

- Tall above-fold media → `hero` (`hero_tall_media_heuristic`); mid-page tall media → `feature`.
- Skip broad `social_proof` catalog matches for tall/near-top media-only bands.
- Tighten `logo_marquee` hints to require repeated media roles.
- Diversity caps in `selectSectionsForLook` (per category / unique signature).
- Section-look system prompt: refine category + unique look_summary.
