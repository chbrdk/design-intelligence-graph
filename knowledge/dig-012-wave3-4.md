# DIG-012 Wave 3–4 runtime (2026-08-15)

## Shipped

### Wave 3 — Prompt pack assembler
- Runtime: `src/design-prompt-pack.ts` (`assembleDesignPromptPack`, `compactDesignReference`)
- Library API: `POST /api/library/references/prompt-pack`
- Eval R2 reuses assembler via `assemblePromptPackEnvelope` re-export
- Tests: `test/design-prompt-pack.test.ts`, `test/look-contract.test.ts`
- Look contract (`0.1.0`) is attached to every pack from measured tokens or compact reference colors; see [`knowledge/look-contract.md`](../knowledge/look-contract.md)

### Wave 4 — look_conditioned generation
- Runtime: `src/look-conditioned-generation.ts` (mapping SoT: `fixtures/design-references/look-conditioned-mapping.json`)
- Hooked from `src/layout-generation.ts` (`deriveLayoutFromReferencePack`, optional pack path on generate)
- `generation_version` `0.3.0`: `look_contract` overwrites `token_hints`; LLM layout_hints only fill empty slots; constraints include `avoid:`
- Schema additive: `schemas/layout-spec.schema.json` allows `0.3.0` + `look_contract`
- Tests: `test/look-conditioned-generation.test.ts`, extended `test/layout-generation.test.ts`

## CHECKION peer harden (partial)
- dig-api Coolify: `CHECKION_API_URL` + `DIG_CHECKION_SCREENSHOTS=1` set
- Island: duplicate `CHECKION_API_URL` removed
- Code: staging without `CHECKION_API_TOKEN` skips with explicit reason (`checkionPeerReadyReason`)
- **Status:** `CHECKION_API_TOKEN` set on dig-api Coolify (2026-08-15); redeploy queued.

## Operator next
1. Create token in CHECKION staging Settings (Plexon-authed session)
2. Coolify dig-api → set `CHECKION_API_TOKEN` (paths: `knowledge/paths.json` → `checkionV3.apiTokenEnv`)
3. Redeploy dig-api; smoke one capture attach
