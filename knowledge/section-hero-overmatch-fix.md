# Section hero overmatch (2026-08-16)

## Symptom

Full-page Porsche (and similar marketing sites) showed ~5–6× `hero` in Analyses `section_look` list, while model grids, lifestyle bands, and editorial modules were missing or collapsed into one content row.

## Causes

1. `classifySection` used the **root** box for full-bleed / tall-media checks. A giant `<main>` wrapper (full page width × height) with a nested media tile still looked like a full-bleed hero.
2. `selectSectionsForLook` allowed many heroes (`maxPerCategory` ~6) and scored hero +2.
3. `detectSectionRoots` selected tall `<main>` first, then skipped every nested `section`/`article` as “contained”.

## Fixes

- Classify hero/tall-media from the **largest media role box**, not the page shell.
- Stricter above-fold + `fullBleedMedia` for hero; near-top tiles → `feature` (`near_top_media_card_heuristic`).
- Hard-cap **1 hero** in `selectSectionsForLook` + vertical band dedupe for stacked media fragments.
- Prefer nested `section`/`article`/`header`/`footer` when present; skip giant `main`/`div` page shells.
- Catalog: never assign `category: hero` unless above-fold; `heading>body` → content before weak catalog hits (`user_count`, `hero_typographic`).
- LLM prompt: hero only for the primary above-fold full-bleed band.

## Verify

- `node --test --import tsx test/section-composition.test.ts test/section-look.test.ts`
- Re-enrich / re-run Porsche capture and check Analyses section-look list: one hero, then feature/content/nav/commerce.
