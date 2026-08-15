# Local Gemma 4 (MLX) + OpenRouter fallback for DIG design analysis

Added 2026-08-15. Updated for OpenRouter/Nemotron switch.

## Vision note

Vision matters for “what does this screen look like?” Local Gemma is a **VLM** (`mlx-vlm`).
Today’s staged pipeline still sends **compact measurement JSON** (ontology, recipes, tokens) — not screenshot pixels yet.
OpenRouter free **Nemotron Nano** covers text stages when Gemma is busy; reserve **`nvidia/nemotron-nano-12b-v2-vl:free`** (`llm.openrouter.visionModel`) for the upcoming screenshot stage.

## Providers

Configured in [`paths.json`](paths.json) → `llm.*`:

| Mode | Env | Model default |
|------|-----|----------------|
| Local Gemma | `DIG_LLM_PROVIDER=local` (default) | `mlx-community/gemma-4-e4b-it-4bit` |
| OpenRouter | `DIG_LLM_PROVIDER=openrouter` | `nvidia/nemotron-3-nano-30b-a3b:free` |
| Fallback | `DIG_LLM_FALLBACK=openrouter` | same Nemotron free when local connection fails |

API key: `OPENROUTER_API_KEY` (never hardcode). Base URL: `https://openrouter.ai/api/v1`.

## Start local model server (host)

```bash
npm run llm:serve
# → http://127.0.0.1:11434/v1
```

## Enable in DIG

`.env` (local + OpenRouter fallback):

```bash
DIG_LLM_ENABLED=true
DIG_LLM_PROVIDER=local
DIG_LLM_FALLBACK=openrouter
OPENROUTER_API_KEY=sk-or-...
DIG_LLM_BASE_URL=http://127.0.0.1:11434/v1
DIG_LLM_MODEL=mlx-community/gemma-4-e4b-it-4bit
```

OpenRouter only (Gemma busy elsewhere):

```bash
DIG_LLM_ENABLED=true
DIG_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
# optional override:
# DIG_LLM_MODEL=nvidia/nemotron-3-super-120b-a12b:free
```

OrbStack web container reaches local Gemma via `http://host.docker.internal:11434/v1` (see `compose.yaml`).

## Pipeline effect

After capture, job stage **analyzing** runs **staged** LLM calls (default):

1. screen_patterns
2. ui_elements
3. section_recipes (+ page_flow)
4. visual_style
5. synthesize (summary + hypotheses)

Writes `derived/llm-design.json` with `analysis_mode: "staged"` and `mobbin` content blocks.
Set `DIG_LLM_STAGED=false` for the old single-shot prompt.

See [`mobbin-parity.md`](mobbin-parity.md).

**Scale (Mobbin-class volume):** model tiering, queues, caching — [`llm-scaling-mobbin.md`](llm-scaling-mobbin.md). Roles live under `llm.scaling` in [`paths.json`](paths.json).

## Quality smoke (OpenRouter)

```bash
npm run llm:openrouter-smoke
# optional: DIG_OR_MODELS=nvidia/nemotron-3-nano-30b-a3b:free,nvidia/nemotron-3-super-120b-a12b:free
```

Writes reports under `tmp/openrouter-quality/` (gitignored). Needs `OPENROUTER_API_KEY` in `.env`.

## Unified quality eval (text + vision)

Comparable scorecards across models (same fixture + golden expectations):

```bash
npm run llm:quality-eval
# DIG_EVAL_TRACKS=text|vision|both
# DIG_EVAL_MODELS=nvidia/nemotron-3-nano-30b-a3b:free,google/gemma-4-26b-a4b-it:free
```

See [`llm-quality-eval.md`](llm-quality-eval.md). Reports under `tmp/llm-quality-eval/`.
