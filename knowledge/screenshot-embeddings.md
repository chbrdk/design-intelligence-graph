# Screenshot embeddings (Stage C)

**Date:** 2026-08-19  
**Status:** code on `main`; live on staging only after **dig-api** deploy + migration `013`  
**Paths:** `knowledge/paths.json` → `embeddings.screenshot`  
**Do not Coolify-deploy dig-api** while capture `queued` + `capturing` > 0.

## Why a separate table

Hashing is 384-d lexical. Dense Stage B is 1024-d **text** (`qwen/qwen3-embedding-8b`) over canonical look/craft. Neither encodes the screenshot pixels.

Stage C stores **one desktop full-page screenshot per capture** in `screenshot_embeddings` (`vector(768)`). Model: OpenRouter `google/gemini-embedding-2` (text + image in one space). Never cosine-mix with hashing or dense.

The LLM still does not “read” vectors. Retrieval returns screens; the model then sees screenshots and specs.

## Rules

1. Skip upsert when `canonical_sha256` of the image bytes is unchanged.
2. Skip files larger than `embeddings.screenshot.maxBytes` (2 000 000).
3. Query: embed the **text** query with the same Gemini model (`queryInstruction` prefix), then cosine on screenshot rows.
4. MCP / Library screens: `provider=screenshot`. Facets still apply first; `q` is not a facet substring.

## Pipeline

After dense text embed (`embedDenseCapturePackage`), optionally `embedScreenshotForPackage`. Backfill: `POST /api/embeddings/backfill` also lists captures missing a screenshot row.

Disable: `DIG_SCREENSHOT_EMBEDDING_ENABLED=0`. Override model: `DIG_SCREENSHOT_EMBEDDING_MODEL`.

## Search

- `GET /api/library/search?q=…&provider=screenshot`
- `GET /api/library/screens?q=…&provider=screenshot`
- MCP `dig_screen_search` / `spirion.screens_search` with `provider=screenshot`
