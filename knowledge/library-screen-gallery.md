# Library screen gallery (2026-08-17)

Config: `knowledge/paths.json` → `libraryScreenGallery`. Island: `apps/web/lib/library-screen-gallery.ts`, hash `#/library/devices`.

## Layout

1. **Screens** (`#/library/screens`) — desktop cards only. A link under the grid opens the devices page.
2. **Devices** (`#/library/devices`) — tablet + mobile, with a viewport chip (`all` / `tablet` / `mobile` via `devicesQueryParam`).

Library modes use msqdx-ui `MagazineContentsNav` (sticky Contents, same pattern as CHECKION scan/GEO). Items come from `libraryModeNavItems()` in `apps/web/lib/library-hash.ts`. Copy: `paths.libraryCopy.contentsLabel` / `screensLabel` / `devicesLabel` / `sectionsLabel` (Modules) / `flowsLabel`. Module gallery: [`library-module-gallery.md`](library-module-gallery.md).

Canonical capture viewports stay `mobile` / `tablet` / `desktop`. The gallery split is display-only; the API still returns every viewport.
