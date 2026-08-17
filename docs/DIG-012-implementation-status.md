# DIG-012 Implementation Status

**Spec:** [DIG-012 Design Reference](DIG-012-design-reference.md)  
**Updated:** 2026-08-15  
**Policy:** Spec-first; **higher agent-value priority than DIG-011 runtime**. Multi-tenant MCP waits on [DIG-013](DIG-013-plexon-app.md) (Plexon auth + Collection binding). See [`knowledge/runtime-open-topics-challenge.md`](../knowledge/runtime-open-topics-challenge.md).

| Requirement | Status | Notes |
| --- | --- | --- |
| ADR-012 | Done | |
| Parent spec + size budgets | Done | |
| Schemas (reference, pack, MCP tools) | Done | |
| Fixtures (aurora / login / pack) | Done | |
| Validation tests (Wave 0) | Done | `test/design-reference.test.ts` |
| Prompt-pack spec + schema + fixture | Done | `docs/DIG-012-prompt-pack.md` |
| Look-conditioned DIG-008 mapping | Done | `docs/DIG-012-look-conditioned-generation.md` + mapping fixture |
| Embeddings / similarity spec | Done | `docs/DIG-012-embeddings.md` |
| Design quality eval scenario | Done | `docs/DIG-012-design-quality-eval.md` + `fixtures/eval/design-reference-hero/` |
| Spec-era helpers/tests (canonical, constraints) | Done | `src/design-reference-spec.ts` |
| Platform tenancy (DIG-013) | P2 projects Done | Auth island + dig binding + PUT/GET provisioning; live MCP still Wave 2 |
| Emit `derived/design-references.jsonl` | Done (Wave 1 dummy) | `src/design-reference-emit.ts`; hooked from enrich + db-index |
| Library/MCP reference APIs | Done (Wave 2) | `GET/POST /api/library/references*`; MCP `dig_reference_*`; Collection filter + live gate |
| Prompt-pack runtime assembler | Done (Wave 3) | `src/design-prompt-pack.ts`; `POST /api/library/references/prompt-pack` |
| DIG-008 look_conditioned runtime | Done (Wave 4 + look-contract bind) | `src/look-conditioned-generation.ts`; `generation_version` `0.3.0` |
| DesignReference embeddings (`similar_to`) | Done (hashing) | `src/design-reference-embeddings.ts`; sidecar + PG `subject_kind=design_reference` |
| `eval:design-reference` runner | Done | `npm run eval:design-reference` (R1/R2/R4 + E1) |
