# Dense embeddings (concept)

**Date:** 2026-08-19  
**Status:** live — hashing stays default; dense runs after enrichment + backfill  
**Paths:** `knowledge/paths.json` → `embeddings` + `embeddings.dense`  
**Canonical helpers:** `src/dense-embedding-canonical.ts`  
**Hashing runtime (keep):** [`dig-012-embeddings-runtime.md`](dig-012-embeddings-runtime.md) · [`docs/DIG-012-embeddings.md`](../docs/DIG-012-embeddings.md)

## Why hashing is not enough

Staging already writes **hashing** vectors (`dig-hashing-v1`, 384-d bag-of-tokens) for almost every indexed subject. Cosine over that space is lexical overlap. A query like “minimal monochrome real-estate, large type, few images” hits `visual_style … monochrome` because the word `monochrome` hashes into the same bins — not because the screen is actually sparse, large-type, low-imagery.

MCP already has **hard craft facets** (`imagery_density`, `type_scale`, `contrast_mode`, `craft_tags`, …). Those stay the primary filter. Dense embeddings are for:

1. Natural-language intent that does not map 1:1 onto facet vocab
2. `similar_to` a measured **screen** or **module**, not just a DesignReference
3. Neighbors across languages (insurance corpus is worldwide)

Facets first, then vector rank. Never replace craft filters with cosine.

## Hard rules

1. **Never cosine-mix models.** Hashing 384 and dense 1024 live in different tables. A query names one `model`. Dual-index recall uses Reciprocal Rank Fusion, not a concatenated vector.
2. **Embed few documents.** Do not vectorize ontology nodes, `ui_element Button`, page-flow steps, or `content · body` dumps. Those pollute neighbors.
3. **Canonical text only.** No URL, brand, product name, capture id, DOM, or media path in the string. Truncate look prose first (1 500 chars).
4. **Embed after enrichment.** Dense text needs LLM look / craft / rhythm. Capture-time hashing of sections can stay as a lexical fallback.
5. **API deploy when capture queue is idle.** Migration `012_dense_embeddings.sql` + OpenRouter calls run inside dig-api. Restart drops the in-memory job list.

## Documents (Stage B)

| `subject_kind` | One row per | When |
|----------------|-------------|------|
| `screen` | Desktop viewport (fallback: capture) | Enrichment complete + craft facets present |
| `module` | Section in `libraryModuleGallery.categories` (hero, nav, feature, conversion, commerce, social_proof) | Same; skip `content` / body |
| `design_reference` | Existing DIG-012 canonical | On emit, same as hashing sidecar |

Screenshot / multimodal vectors are **Stage C**: [`screenshot-embeddings.md`](screenshot-embeddings.md) — separate Gemini 768-d table. Island neighbor view: [`similarity-graph.md`](similarity-graph.md).

## Canonical recipes

Stable key order, lowercase values, `key:value` lines. Builders: `buildScreenEmbeddingCanonical` / `buildModuleEmbeddingCanonical`. DesignReference keeps `buildEmbeddingCanonical` in `src/design-reference-spec.ts`.

**Screen**

```text
kind:screen
industry:{industry}
style:{style}
layout:{layout}
craft:{craft_tags joined}
imagery:{imagery_density}
type:{type_scale} {type_image_mode}
contrast:{contrast_mode}
energy:{composition_energy}
chrome:{chrome_weight}
look:{look_summary or design_summary}
rhythm:{page_rhythm one-liner}
modules:{hero/nav/feature signatures}
```

**Module**

```text
kind:module
category:{category}
signature:{signature}
craft:{craft_tags joined}
imagery:{imagery_density}
type:{type_scale} {type_image_mode}
contrast:{contrast_mode}
look:{look_summary}
```

Query text uses the same instruction prefix (Qwen3-Embedding is instruction-aware). Default instruction is `embeddings.dense.queryInstruction`.

## Provider (2026-08-18)

OpenRouter is already the staging LLM pipe. Do not add a second embedding vendor for Stage B.

| | Choice |
|---|--------|
| **Production model** | `qwen/qwen3-embedding-8b` |
| Why | Best open-weight retrieval on current multilingual benches; ~$0.01/M on OpenRouter; same key as enrichment; instruction-aware |
| Dims | **1024** via MRL (native 8B is 4096 — store the truncated 1024, not 384) |
| Eval / cheap baseline | `qwen/qwen3-embedding-0.6b` (native 1024). Run the three golden queries on both before locking the default |
| Endpoint | existing `llm.openrouter.baseUrl` + `/embeddings` |
| Auth | `OPENROUTER_API_KEY` (already on dig-api) |
| Env override | `DIG_EMBEDDING_MODEL` / `DIG_EMBEDDING_BASE_URL` |

Not the default:

- **Voyage 4-large** — often tops English RAG benches, extra vendor, not on OpenRouter.
- **Gemini Embedding 2** (`google/gemini-embedding-2`) — text+image in one space. Right for **Stage C screenshot** retrieval; different recommended dims (768 / 1536 / 3072), so not the Stage B text table.
- **OpenAI text-embedding-3-large** — fine, older, more expensive, weaker multilingual than Qwen3-8B.

Changing **dims** requires a new table or a full re-embed. Switching 0.6B ↔ 8B at 1024 does not.

Cost sketch: one screen + ~6 modules × ~400 tokens ≈ 3k tokens/capture. 1 000 insurance URLs ≈ 3M tokens ≈ **a few cents** at 8B list prices. LLM enrichment dominates spend.

## Storage

Keep `embeddings.embedding vector(384)` for hashing. **Do not ALTER it** on the live volume.

New table: migration `db/migrations/012_dense_embeddings.sql`.

Skip upsert when `canonical_sha256` is unchanged.

## Pipeline

1. Enrichment job completes → existing DB reindex (hashing, as today).
2. **Dense embed** in-process after reindex: build canonicals → OpenRouter embeddings → upsert `dense_embeddings` (skip unchanged `canonical_sha256`).
3. Backfill: `POST /api/embeddings/backfill` `{ "limit": 25 }` (Bearer auth) over captures with `llm_analyses.status=complete` and no dense screen row. Use `{ "mode": "refresh", "limit": 50 }` to re-embed packages that already have a screen row when canonical text changed (e.g. `value:` / `palette:` after Phase 2) — unchanged `canonical_sha256` still skips the OpenRouter call. Refresh prefers **oldest** screen embeddings so repeated batches walk the corpus.
4. Search: `GET /api/library/search?q=&provider=dense` (+ optional `subject_kind=screen|module|design_reference`). Default remains `provider=hashing`.

Hashing `GET /search` stays as `provider=hashing` default until dense eval passes.

## Eval (must exist before flipping the default)

Minimum golden queries in `fixtures/eval/dense-embeddings/`:

| Query | Must rank above | Must not top |
|-------|-----------------|--------------|
| `minimal monochrome large type few images` | low-imagery / monumental / monochrome screens (e.g. City Arcade craft) | dense gallery / photo-heavy heroes |
| `similar_to` aurora-style product hero | other product heroes | login / cookie walls |
| German `ruhig, wenig Bilder, große Schrift` | same craft cluster as the English query | English-only token hits |

Record Recall@10 vs hashing on the same set. Flip MCP default to dense only if dense wins on all three.

## Non-goals (this concept)

- Island Library search box (compose stays on MCP)
- Cross-encoding reranker (optional later: `qwen/qwen3-reranker-0.6b`)
- Replacing craft facets

## MCP (2026-08-19)

`dig_screen_search` / `GET /api/library/screens`: when `q` is set, default `provider=dense` and search is **retrieval-first** over the full dense corpus, then facet filters + hydrate (desktop row). Without `q`, browse stays newest-first. Response includes `retrieval: "corpus" | "window"`. Island Library search box stays hashing-free; compose stays on MCP.

**Diversification (2026-09-04):** after corpus retrieval, results are re-ranked with **MMR** (`libraryScreenSearch.diversify`, default on) so Top-k prefers relevance but punishes same-domain / same-style / same-contrast repeats. Candidate pool defaults to **128** (cap **200**) via `libraryScreenSearch` in `paths.json`. This stops sticky hubs when many screens score similarly (e.g. “minimal monochrome”).

**Fine facets + NL intent (2026-09-04, Phase 2):** screen canonical includes `value:` / `palette:`; `q` soft-infers craft facets (`inferred_facets` on the response) without hard-emptying results. Explicit `value_key` / `palette` query params remain hard filters. Re-embed improves retrieval for the new tokens; list-time facets update on read.

`GET /api/library/search` **must** stay `provider=hashing` when `provider` is omitted.

Live after the next **dig-api** deploy. Capture queue is Postgres-backed; prefer idle queue when possible, but MMR is read-path only.
