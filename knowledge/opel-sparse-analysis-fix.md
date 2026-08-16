# Opel sparse analysis / bare-body commerce (2026-08-16)

## Symptom

Library detail for `https://www.opel.de/` showed:
- “No analysis summary yet”
- empty Page narrative
- “No section_look yet… sparse pages…”

API already had complete enrichment (`cap_073fff72d1a44d8786066f4e7e9c4c60`): design_summary + 5 section_look rows.

## Causes

1. **Library UI** silently swallowed `fetchAnalysisDetail` errors and never loaded `fetchPageFlows` (narrative was static hint only). Opening a screen before enrichment finished left the panel empty forever.
2. **Section classify**: catalog `dig:section.inventory_status` hint `["body"]` labeled **all** Opel bands as `commerce · body` (50/50). Recipes often collapse to bare `body` when media is CSS/background-heavy.
3. Giant page shells still competed with real bands.

## Fixes

- Library: retry analysis while enriching; render page-flow steps; clearer pending copy.
- Skip bare-`body` catalog hits for commerce/feedback/social_proof without text cues → `content`.
- Treat giant `section`/`article` as page shells when nested bands exist.
- Soft-penalize thin (&lt;120px) and huge (&gt;2800px) bands in `selectSectionsForLook`.

## Verify

- Re-open Opel screen in Library (or re-capture after dig-api deploy).
- Analyses detail should show summary + section_look immediately via `/api/dig/api/library/analyses/{id}`.
