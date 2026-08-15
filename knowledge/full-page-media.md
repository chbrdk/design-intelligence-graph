# Full-page media in DIG

**Date:** 2026-08-15 (updated)

## Policy

**CHECKION v3 is the source of truth for complete-page screenshots.** See `knowledge/checkion-screenshots.md`.

DIG Playwright still writes `settled.webp` / `full-page.webp` during DOM capture, but after a successful CHECKION scan the desktop `full_page_screenshot` artifact is replaced by `checkion-full-page.jpg`.

## Library / vision

1. Library API — `full_page_url`, `primary_url` (full-page preferred), `document_width/height`; hotspots normalize to document size; JPEG served as `image/jpeg`.
2. UI — grid + detail use primary/full-page; detail stage scrolls tall pages.
3. Vision — prefers `full_page_screenshot` (`DIG_LLM_VISION_FULL_PAGE`, default true); MIME from file extension.

## Legacy DIG-only path

If `DIG_CHECKION_SCREENSHOTS=0`, DIG Playwright full-page remains primary. Prefer fixing CHECKION instead of re-investing in Playwright full-page fidelity.
