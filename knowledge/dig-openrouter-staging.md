# DIG staging OpenRouter enrichment (2026-08-15)

## Status

- dig-api Coolify: `DIG_LLM_*` OpenRouter flags set
- **Blocked until** `OPENROUTER_API_KEY` is pasted into dig-api Coolify env
- Models: text `nvidia/nemotron-3-nano-30b-a3b:free`, vision `nvidia/nemotron-nano-12b-v2-vl:free`

## After key

1. Coolify dig-api restart (or force deploy)
2. Run capture → expect event `LLM enrichment queued`
3. `GET /api/enrichment` shows running/complete job
