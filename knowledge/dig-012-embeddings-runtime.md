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

## Shipped (dense / Stage B)

- Migration: `db/migrations/012_dense_embeddings.sql` → table `dense_embeddings` (`vector(1024)`)
- Runtime: `src/dense-embeddings.ts`, `src/dense-embedding-subjects.ts`, `src/dense-embedding-package.ts`
- Canonical builders: `src/dense-embedding-canonical.ts` (screen/module) + existing DesignReference canonical
- Provider: OpenRouter `qwen/qwen3-embedding-8b` at 1024-d MRL (`OPENROUTER_API_KEY`, override `DIG_EMBEDDING_MODEL`)
- After enrichment reindex: embed screen + gallery modules (+ design references on index)
- Backfill: `POST /api/embeddings/backfill` `{ "limit": 25 }`
- Search: `GET /api/library/search?q=…&provider=dense` (+ optional `subject_kind`)
- Tests: `test/dense-embeddings.test.ts`, `test/dense-embedding-canonical.test.ts`

Hashing `GET /search` stays default (`provider=hashing`) until dense eval passes.

## Screenshot (Stage C)

- Migration: `db/migrations/013_screenshot_embeddings.sql` → `screenshot_embeddings` (`vector(768)`)
- Runtime: `src/screenshot-embeddings.ts` — OpenRouter `google/gemini-embedding-2`
- After dense package embed + `POST /api/embeddings/backfill`
- Search: `provider=screenshot` on `/search` and `/screens`
- Doc: [`screenshot-embeddings.md`](screenshot-embeddings.md)

MCP `dig_screen_search` defaults to dense when `q` is set (API deploy required). Island Graph: [`similarity-graph.md`](similarity-graph.md).

## Still optional

- Dual-index recall union (RRF hashing + dense; never mixed cosine)
- MCP default flip to dense after eval fixtures pass

## Blocked elsewhere

- CHECKION token set on dig-api; verify capture attach after deploy
