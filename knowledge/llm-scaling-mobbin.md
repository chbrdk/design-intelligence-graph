# LLM scaling toward Mobbin-class coverage

Added 2026-08-15. Paths/roles: [`paths.json`](paths.json) → `llm.scaling`.

## Why this matters

[Mobbin](https://mobbin.com) is not one LLM call per page — it is a **library product**: many apps × many screens × searchable facets (patterns, UI, flows, style). DIG already captures measured evidence; LLM enrichment must scale without exploding cost or latency.

Rough order of magnitude (illustrative):

| Scale | Screens / month | LLM calls (5 text + 1 vision) | Notes |
| --- | ---: | ---: | --- |
| Solo / studio | 200 | ~1.2k | Free/dev models ok |
| Small product | 5 000 | ~30k | Need paid bulk model |
| Mobbin-ish library | 100 000+ | 600k+ | Queue + cache + tiered models required |

At Mobbin-like volume, **every extra stage is a cost multiplier**. Vision on every viewport is the expensive axis.

## Current DIG call shape

Per capture (staged mode):

1. `screen_patterns`
2. `ui_elements`
3. `section_recipes` (+ page flow)
4. `visual_style`
5. `synthesize`
6. *(planned)* vision screen score / OCR / hotspot labels per viewport

Config: `llm.stagedAnalysis`, `llm.stageMaxTokens`, quality eval in [`llm-quality-eval.md`](llm-quality-eval.md).

## Model tiering (recommended)

From [`paths.json`](paths.json) `llm.scaling.roles` (Aug 2026 OpenRouter):

| Role | Default model | Use when |
| --- | --- | --- |
| `bulkText` / `bulkVision` | `qwen/qwen3.7-flash` | Default enrichment at volume (~$0.03/$0.13 under 32K) |
| `qualityText` / `qualityVision` | `openai/gpt-5.6-luna` | Hard pages, low confidence, editorial QA |
| `freeDev*` | Nemotron / Gemma `:free` | Local eval, CI smoke — not production volume |

**Qwen thinking tax:** Qwen3.7 Flash enables reasoning by default. With DIG’s small `stageMaxTokens` (~700) it can return `content: null` after burning the budget on thinking. For bulk JSON stages set `DIG_LLM_REASONING_EFFORT=none` (or `reasoning: { effort: "none" }` / `enable_thinking: false`). Quality escalate to Luna can keep default reasoning.

**Routing rule of thumb:** run bulk first; escalate to Luna only if stage confidence is low, JSON repair fails, or vision disagrees with measured recipes.

Keep prompts **under 32K** so Qwen stays in the cheap bracket (longer context jumps price sharply).

## Architecture for scale (build status)

1. **Async enrichment queue** — Done (DIG-009): capture finishes without blocking; `EnrichmentQueue` + `/api/enrichment`
2. **Idempotent stage store** — Done: file cache `indexes/llm-stage-cache` + migration `004`
3. **Parallelize independent stages** — Planned
4. **Vision budget** — Planned
5. **Cache + embeddings** — Partial (hashing embeddings exist; stage cache done)
6. **Rate limits & backpressure** — Partial (enrichment retries)
7. **Cost telemetry** — Planned
8. **Eval gate** — Done (`npm run llm:quality-eval`)

Confidence routing bulk→quality: Done in `analyzeDesignWithLlmStaged` via `llm.scaling`.

## Cost sketch (Qwen bulk, short prompts)

Assume ~2k input + 400 output tokens per stage, 6 stages/capture:

- ~14.4k tokens in + 2.4k out per capture  
- ≈ **$0.0007 / capture** at $0.03/$0.13  
- 100k captures ≈ **~$70** (order of magnitude; images add vision tokens)

Luna at $0.10/$0.60 is roughly **5–10×** that — fine for a quality slice (e.g. 5–10% of traffic), expensive as default.

## Product surface (Mobbin-like)

LLM output must land in **searchable library fields**, not only `design_summary`:

- screen patterns, UI elements, recipe signatures, flows, style labels  
- later: collections, hotspots, “similar screens” via embeddings  

Parity stages: [`mobbin-parity.md`](mobbin-parity.md).

## Decision log

| Date | Decision |
| --- | --- |
| 2026-08-15 | Free models for eval/dev; Qwen3.7 Flash proposed bulk; GPT-5.6 Luna proposed quality escalate. Confirm with live `llm:quality-eval`. |
| 2026-08-15 | Live eval (`reasoning.effort=none`): **Qwen 80% text / 100% vision (overall 90%)**; **Luna 85% text / 100% vision (overall 92.5%)**. Qwen without reasoning-off returned empty content. For Mobbin-scale: Qwen = default bulk, Luna = quality escalate (~5–10% traffic). |
