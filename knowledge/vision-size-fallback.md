# Vision fallback + page synthesize polish (2026-08-15)

## Vision failed on Porsche

Full-page CHECKION JPEGs (8k+ px) often exceed free VL / OpenRouter payload limits. Enrichment reported `vision=failed` without a useful error.

## Fixes

1. `loadVisionImage`: try full-page then settled; skip files over `DIG_LLM_VISION_MAX_BYTES` (default 2.5MB / `paths.llm.scaling.visionMaxBytes`).
2. Persist `vision: <error>` on enrichment job when vision fails.
3. Synthesize prompt: page-level 3–5 sentences; do not paste one section_look verbatim.
4. Skip giant `body`/`unknown` page wrappers in `selectSectionsForLook`.
5. Demote thin `social_proof` → `content` when signature is body/unknown without social cues.
