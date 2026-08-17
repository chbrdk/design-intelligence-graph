# vision_page_ux retry (2026-08-17)

**Symptom:** MSQ `cap_fa473a7373d845d580511aadd070dbc0` had `vision_page_ux` **failed** while other stages completed. Layout/spacing/UX flow then missing from facets/summary.

**Fix:** `runVisionPageUxAnalysis` retries once with higher `max_tokens` (900 → 1400) if parse fails or JSON lacks `layout_system` and `above_fold_job`. Default token budget raised from 700. Prompt still text-only (no second image).

Re-capture after deploy to refresh UX fields on existing screens.
