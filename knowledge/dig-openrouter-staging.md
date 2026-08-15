# DIG staging OpenRouter enrichment (2026-08-15)

## Status

- dig-api Coolify: `DIG_LLM_*` OpenRouter flags set
- `OPENROUTER_API_KEY` set in Coolify (secret; not in git)
- Models: text `nvidia/nemotron-3-nano-30b-a3b:free`, vision `nvidia/nemotron-nano-12b-v2-vl:free`

## Smoke

1. Restart/redeploy dig-api after env changes
2. Capture → expect event `LLM enrichment queued`
3. `GET /api/enrichment` shows running/complete job

## Related blocker fixed

CHECKION attach could fail verify on aliased JPEG paths — see `knowledge/checkion-duplicate-artifact-path.md`.
