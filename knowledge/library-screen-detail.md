# Library screen detail

**Updated:** 2026-08-17

## UX

Clicking a Library screen card opens `#/library/screens/{viewport_capture_id}`:

1. Toolbar (back, viewport/full page, overlay, **Copy prompt pack**)
2. **Design profile** (`ScreenInsightStrip`) — page type, style, layout, color, typography, industry + section chips, look-contract swatches / CTA / density / Avoid
3. Split:
   - Left: screenshot + vision band overlays
   - Right: collapsible summary, page narrative, section accordion

Vision layout notes are under **Notes**, not in the hero.

## Files

- `apps/web/components/library-screen-detail.tsx`
- `apps/web/components/screen-insight-strip.tsx`
- `apps/web/lib/library-hash.ts` (`screen_detail`)
- `apps/web/lib/dig-api.ts` (`design_facets` on analysis package; `fetchCapturePromptPack`)
- Capture prompt pack: `POST /api/library/analyses/:capture_run_id/prompt-pack`
- Facet contract: [`design-facets.md`](design-facets.md)
- Look contract: [`look-contract.md`](look-contract.md)
