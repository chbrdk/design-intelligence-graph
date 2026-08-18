# Library module gallery (2026-08-18)

Config: `knowledge/paths.json` → `libraryModuleGallery`. Island: `apps/web/lib/library-module-gallery.ts`, hash `#/library/sections?module=hero`.

## Why

Unfiltered `GET /api/library/sections` is ordered by confidence and is mostly `content · body` (paragraph dumps). That list is not a product surface. Capture still writes every composition for Section look / LLM / MCP.

## What the Library tab shows

Contents item **Modules** (`sectionsLabel`). Cards are desktop bands in distinctive categories (`hero`, `nav`, `feature`, `conversion`, `commerce`, `social_proof`), joined to currently listed screens so a click opens the parent capture.

Thin rows (`thinCategories` × `thinSignatures`, default `content` + `body`/`unknown`) stay out of the grid. One card per capture per category (highest confidence). CSS crop uses `root_box` against the full-page screenshot (`width` × `document_height`).

## API

No API deploy. The existing `GET /api/library/sections?category=` filter is enough. Island fetches those categories and never the unfiltered dump.

## Limits

Screen list is capped (~200 viewports ≈ ~67 desktop). Modules whose capture is not in that window have no thumbnail and are omitted. A later API join (crop_url + viewport_capture_id on `/sections`) would lift that without changing the gallery UX.
