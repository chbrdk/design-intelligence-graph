# Vision empty content (2026-08-16)

## Symptom

Latest captures (e.g. udg.de): `vision_page` / `vision_layout` fail with `Local LLM response has no message content`. Library shows **no** overlays (DOM fallback removed).

## Cause

Staging used `DIG_LLM_VISION_MODEL=nvidia/nemotron-nano-12b-v2-vl:free`. That VL free model often returns empty `content` (reasoning burns the token budget), so band detection never completes.

## Fix

1. Default / Coolify vision model → `google/gemma-4-31b-it:free` (multimodal).
2. Provider: treat empty content as retryable; one retry with `reasoning=none` + higher `max_tokens`; optionally parse JSON from `reasoning` field.
3. OpenRouter primary → fallback to `DIG_LLM_VISION_FALLBACK_MODEL` / `visionModelFallback` on empty/429.
4. Vision stages request more completion tokens.

## Verify

Re-capture after dig-api redeploy; stages `vision_page` + `vision_layout` complete; screen detail shows full-width band overlays.
