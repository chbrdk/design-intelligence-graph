# Qwen 3.7 Flash for vision (2026-08-16)

## Decision

Drop NVIDIA free VL/text defaults. Staging vision + text bulk use **`qwen/qwen3.7-flash`** (OpenRouter; supports text/image/video). Fallback vision: `qwen/qwen3.6-flash`.

## Why

- Nemotron free VL returned empty `content` → no section bands
- Qwen 3.7 Flash already used as `bulkText` / `bulkVision` in scaling roles
- Confirmed on OpenRouter (2026-08-16): `input_modalities: text, image, video`

## Coolify

- `DIG_LLM_MODEL=qwen/qwen3.7-flash`
- `DIG_LLM_VISION_MODEL=qwen/qwen3.7-flash`
- `DIG_LLM_VISION_FALLBACK_MODEL=qwen/qwen3.6-flash`
- `DIG_LLM_REASONING_EFFORT=none` (Qwen thinking tax)
