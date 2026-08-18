# Library screen detail

**Updated:** 2026-08-18

## UX

Library **Screens** grid:

1. Desktop cards only (tablet/mobile live on `#/library/devices` — `knowledge/library-screen-gallery.md`)
2. Chip filters for **Style**, **Layout**, **Industry** (`?style=&layout=&industry=` — keys in `knowledge/paths.json` `libraryScreenFacets`)
3. Cards show compact facet chips (style, layout, first industry)
4. Clicking a card opens `#/library/screens/{viewport_capture_id}`:

   1. Toolbar (back, viewport/full page, overlay, **Copy prompt pack**)
   2. **Design profile** (`ScreenInsightStrip`) — magazine masthead: page type, style, layout, color, typography, industry + section chips, look-contract swatches / CTA / density / Avoid
   3. Split:
      - Left: screenshot + vision band overlays
      - Right: collapsible summary, **Page narrative**, **Section look** accordion (`SectionChrome`)
   4. **Visual craft** full-width magazine chapter under the split — `Panel` cards in a `Grid` (type/image, typography, imagery, space, chrome) with msqdx-ui icons; **Rebuild spec** spans the row

Vision layout notes are under **Notes**, not in the hero.

## Files

- `apps/web/components/library-page.tsx` (facet chip filters)
- `apps/web/components/library-screen-detail.tsx`
- `apps/web/components/screen-insight-strip.tsx`
- `apps/web/components/visual-craft-panel.tsx`
- `apps/web/lib/library-hash.ts` (`screen_detail`)
- `apps/web/lib/dig-api.ts` (`design_facets` on analysis package; `fetchLibraryScreensPage`; `fetchCapturePromptPack`)
- `GET /api/library/screens` compact `design_facets` + `facet_filters`
- Capture prompt pack: `POST /api/library/analyses/:capture_run_id/prompt-pack`
- MCP loop: [`mcp-library-loop.md`](mcp-library-loop.md) (`dig_screen_search` → `dig_capture_prompt_pack`)
- Facet contract: [`design-facets.md`](design-facets.md)
- Look contract: [`look-contract.md`](look-contract.md)
- Page rhythm: [`page-rhythm.md`](page-rhythm.md)
- Visual craft: [`visual-craft.md`](visual-craft.md)
