# Library screen detail (2026-08-16)

## UX

Clicking a Library screen card opens `#/library/screens/{viewport_capture_id}`:

- Left: large settled / full-page screenshot (`ToggleGroup`) with optional section overlay hotspots from `GET /api/library/screens/:id`
- Right: analysis summary, page narrative, **msqdx Accordion** of `section_look` rows

Back returns to `#/library/screens`.

## Files

- `apps/web/components/library-screen-detail.tsx`
- `apps/web/lib/library-hash.ts` (`screen_detail`)
- `apps/web/lib/dig-api.ts` (`fetchScreenDetail` + hotspots)
