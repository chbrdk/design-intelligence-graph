# Library module gallery (2026-08-18)

Config: `knowledge/paths.json` → `libraryModuleGallery`. Island: `apps/web/lib/library-module-gallery.ts`, hash `#/library/sections?module=hero`.

## Why

Unfiltered `GET /api/library/sections` is ordered by confidence and is mostly `content · body` (paragraph dumps). That list is not a product surface. Capture still writes every composition for Section look / LLM / MCP.

## What the Library tab shows

Contents item **Modules** (`sectionsLabel`). Cards are desktop bands in distinctive categories (`hero`, `nav`, `feature`, `conversion`, `commerce`, `social_proof`), joined to viewport media so a click opens the parent capture.

Thin rows (`thinCategories` × `thinSignatures`, default `content` + `body`/`unknown`) stay out of the grid. Multiple modules per capture are kept (keyed by `section_id`). CSS crop uses `root_box` against the full-page screenshot (`width` × `document_height`).

## API

`GET /api/library/sections?category=` joins `viewports` + `captures` and returns media URLs (`full_page_url`, `primary_url`, …) plus `site_domain` / dimensions. Limit 500 per category filter. Island does not depend on the screens list window for thumbnails.

## Limits

`maxPerCategory` (all view) and `maxFiltered` (single chip) cap the grid. Body dumps stay filtered. A later cursor/page for sections would lift the 500-row API window without changing the gallery UX.
