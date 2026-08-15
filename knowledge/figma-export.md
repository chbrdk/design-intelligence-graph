# Figma export (plugin-friendly JSON)

Added 2026-08-15.

## What it is

`GET /api/library/export/figma?capture_run_id=` returns a DIG document shaped for later Figma Plugin import:

- `DOCUMENT` → viewport `FRAME`s
- Section roots / recipe roles as `RECTANGLE`s (pixel boxes)
- Page-flow labels as `TEXT` nodes

Built by [`src/figma-export.ts`](../src/figma-export.ts). No Figma REST OAuth/push in this phase.

## Usage

1. Open a screen in the Library UI → **Download Figma export JSON**
2. Or call the API directly
3. A future plugin can map `FRAME`/`RECTANGLE`/`TEXT` into native Figma nodes

Paths stay in `knowledge/paths.json` → `api.libraryPath`.
