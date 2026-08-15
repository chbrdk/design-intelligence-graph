# DIG LLM quality eval (text + vision)

Comparable scoring across models using one fixed scenario and golden expectations.

## Why vision

Staged DIG analysis (`analyzeDesignWithLlm`) is still **text-from-measurements**. Vision is required to judge screenshot understanding (heading, CTA, layout order) and to pick VL models for future pixel-aware stages. The eval runs both tracks on the same fixture so scores stay comparable.

## Scenario

Default: `fixtures/eval/marketing-hero/`

| File | Role |
| --- | --- |
| `page.html` | Deterministic hero (media → “Aurora Phone” → “Learn more”) |
| `scenario.json` | Measured-style evidence + golden keywords |
| `settled.webp` | Auto-generated via Playwright on first run |

Roster + paths: `knowledge/paths.json` → `llm.qualityEval`.

## Run

```bash
npm run llm:quality-eval
```

Requires `OPENROUTER_API_KEY` in `.env` (never commit the key).

Optional env:

| Env | Effect |
| --- | --- |
| `DIG_EVAL_SCENARIO` | Scenario folder under `fixtures/eval` (default `marketing-hero`) |
| `DIG_EVAL_TRACKS` | `both` (default), `text`, or `vision` |
| `DIG_EVAL_MODELS` | Comma-separated OpenRouter model ids (overrides roster) |
| `DIG_EVAL_VISION_TIMEOUT_MS` | Vision request timeout (default max(pipeline, 180000)) |
| `DIG_EVAL_VISION_RETRIES` | Retries on 429/timeout (default `3`) |
| `DIG_EVAL_MODEL_GAP_MS` | Pause between models (default `2500`, helps free-tier rate limits) |
| `DIG_LLM_TIMEOUT_MS` / `DIG_LLM_STAGE_MAX_TOKENS` | Same as pipeline |

Reports land in `tmp/llm-quality-eval/` (gitignored): per-model JSON + `*__summary.md`.

## Scoring

Deterministic scorer: `src/llm-quality-score.ts`

- **text_staged** (100 pts): stage completion, screen patterns, UI elements, recipes, page flow, style keywords, JSON validity
- **vision_screen** (100 pts): heading keywords, CTA keywords, layout order from screenshot
- **overall**: mean of non-skipped tracks

Unit tests: `test/llm-quality-score.test.ts`.

## Default models (Aug 2026 free tier)

1. `nvidia/nemotron-3-nano-30b-a3b:free` — text only  
2. `nvidia/nemotron-nano-12b-v2-vl:free` — vision only  
3. `google/gemma-4-26b-a4b-it:free` — text + vision  

Edit `llm.qualityEval.models` in `paths.json` to change the roster without touching the harness.

## Related

- Quick smoke without vision: `npm run llm:openrouter-smoke`
- Provider notes: [`gemma-llm.md`](gemma-llm.md)
