# DIG-012 DesignReference embeddings runtime (2026-08-15)

## Shipped (hashing / Stage A)

- Canonical text: existing `buildEmbeddingCanonical` (`src/design-reference-spec.ts`)
- Runtime: `src/design-reference-embeddings.ts`
  - Sidecar: `derived/design-references.embeddings.jsonl` on emit
  - Postgres: `embeddings.subject_kind = design_reference` via `upsertEmbeddingSubjects` (does not wipe other kinds)
  - Offline rank: `rankReferencesBySimilarity`
  - Live search: `searchDesignReferences({ similar_to })` → cosine via pgvector
- API: `GET /api/library/references?similar_to=ref_…`
- MCP: `dig_reference_search` arg `similar_to`
- Tests: `test/design-reference-embeddings.test.ts`

## Still optional

- Dense provider (OpenRouter / local) using `DIG_EMBEDDING_*` envs
- Dual-index recall union

## Blocked elsewhere

- CHECKION token set on dig-api; verify capture attach after deploy
