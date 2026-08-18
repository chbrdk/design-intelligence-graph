# Library screen detail

**Updated:** 2026-08-18

## UX

Library **Screens** grid:

1. Desktop cards only (tablet/mobile live on `#/library/devices` — `knowledge/library-screen-gallery.md`)
2. Chip filters for **Style**, **Layout**, **Industry** (`?style=&layout=&industry=` — keys in `knowledge/paths.json` `libraryScreenFacets`)
3. Cards show compact facet chips (style, layout, first industry)
4. Clicking a card opens `#/library/screens/{viewport_capture_id}`:

   1. AppShell back icon (top-left, `screenDetailBack`) returns to Screens or Devices
   2. **Design brief** (`dig-screen-magazine`) — one editorial chapter:
      - Masthead (title in `Text` `display` / `--weight-thin`, plus URL)
      - Four identity ledes (page type, style, layout, color) plus one quiet chip/swatch row
      - **Visual craft** (`SpecAtomGrid` numbered cards: type/image, typography, imagery, space, chrome, rebuild spec)
      - **UX assessment** (same card grid: above-fold job, flow, spacing, strengths, risks)
      - **Functionality** (detected UI, screen patterns, notable modules)
      - **Section spec** — one independent numbered grid per vision band from `section_look` + `gaps.vision_section` (crop + type/image/space/function/look). Analysis already ran per crop; the island maps those fields onto the visual-craft cards.
   3. Split (drag the gutter to make screenshot or section look narrower; remembered in `libraryScreenDetail.splitStorageKey`):
      - Left: full-page screenshot + vision band overlays (click scrolls to that section spec)
      - Right: collapsible summary, **Page narrative** (from analysis `page_flow` items, `GET /page-flows` only as fallback), **Section look** accordion with the same spec cards

Vision layout notes are under **Notes**, not in the hero. Do not show the `Vision-detected … Full-width band y=` preamble as body copy.

## Files

- `apps/web/components/library-page.tsx` (facet chip filters)
- `apps/web/components/library-screen-detail.tsx`
- `apps/web/components/screen-insight-strip.tsx`
- `apps/web/components/visual-craft-panel.tsx`
- `apps/web/components/ux-assessment-panel.tsx`
- `apps/web/components/functionality-panel.tsx`
- `apps/web/components/spec-atom-grid.tsx`
- `apps/web/lib/spec-atoms.ts`
- `apps/web/lib/library-hash.ts` (`screen_detail`)
- `apps/web/lib/dig-api.ts` (`design_facets` on analysis package; `fetchLibraryScreensPage`; `fetchCapturePromptPack`)
- `GET /api/library/screens` compact `design_facets` + `facet_filters`
- Capture prompt pack: `POST /api/library/analyses/:capture_run_id/prompt-pack`
- MCP loop: [`mcp-library-loop.md`](mcp-library-loop.md) (`dig_screen_search` → `dig_capture_prompt_pack`)
- Facet contract: [`design-facets.md`](design-facets.md)
- Look contract: [`look-contract.md`](look-contract.md)
- Page rhythm: [`page-rhythm.md`](page-rhythm.md)
- Visual craft: [`visual-craft.md`](visual-craft.md)
