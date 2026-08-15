# Enrichment fetch-failed (local Gemma down)

Added 2026-08-15.

## Symptom

Enrichment job shows `fetch failed` × N, 0 tokens, vision failed. Completes in <100ms.

## Cause

1. `.env` pointed `DIG_LLM_BASE_URL` at local Gemma (`:11434`) while scaling roles use OpenRouter model ids.
2. Enrichment passes an overridden `config`, and older code built `OpenAiCompatibleLlmProvider` **without** the local→OpenRouter `FallbackLlmProvider`.
3. Local Gemma was not running → immediate `fetch failed` on every stage.

## Fix

- Always build providers via `createLlmProviderFromConfig` (keeps fallback when `config` is passed).
- Prefer `DIG_LLM_PROVIDER=openrouter` + `DIG_LLM_REASONING_EFFORT=none` when using Qwen bulk roles without a local server.

## Retry

Re-run enrichment on the capture package (or start a new capture) after restarting `npm run serve`.
