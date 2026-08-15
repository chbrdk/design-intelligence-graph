# DIG-012 — DesignReference embeddings & similarity

**Status:** v0.1 — **hashing runtime implemented** (`src/design-reference-embeddings.ts`); dense provider still optional  
**Parent:** [DIG-012](DIG-012-design-reference.md)  
**Paths:** `knowledge/paths.json` → `taxonomy.designReferenceEmbeddings`

## Goal

Enable “find heroes like this, but denser / more editorial” without requiring DIG-011 flows.

## What to embed

Concatenate a **canonical text** (stable ordering, lowercase labels):

```text
category:{category}
signature:{signature}
roles:{roles joined}
look:{look_summary}
style:{style_labels joined}
overlay:{overlay.kind|none}
align_text:{alignment.text|na}
align_cta:{alignment.cta|na}
```

Do **not** embed: evidence_refs, media paths, flow_context URLs, brand product names from page_context if avoidable (use category/signature instead).

Max canonical text: 1 500 characters (truncate look_summary first).

## Providers (staged)

| Stage | Provider | Dims | When |
|-------|----------|------|------|
| A (now available in DIG) | `dig-hashing-v1` (existing) | 384 | Dev / CI / offline; coarse similarity only |
| B | OpenRouter / local embedding model (configurable) | model-native | Production search quality |
| C | Optional dual index | hashing + dense | Recall union |

Config keys (planned under `paths.json`):

```json
"designReferenceEmbeddings": {
  "canonicalVersion": "0.1.0",
  "defaultProvider": "hashing",
  "hashingModel": "dig-hashing-v1",
  "denseModelEnv": "DIG_EMBEDDING_MODEL",
  "denseBaseUrlEnv": "DIG_EMBEDDING_BASE_URL",
  "dimsHashing": 384,
  "doc": "docs/DIG-012-embeddings.md"
}
```

## Similarity API (planned)

`dig_reference_search` gains optional:

- `similar_to: reference_id`  
- `limit`  
- `provider: hashing | dense | auto`

Ranking: cosine similarity on embedding; tie-break by identical `signature`, then `category`.

Filters (`category`, `signature`, style substring) apply **before** vector rank when provided.

## Storage

- File index: sidecar `derived/design-references.embeddings.jsonl` `{ reference_id, provider, dims, vector[], canonical_sha256 }`  
- Postgres: reuse/extend embeddings table pattern from migration `003` with `kind = 'design_reference'`

## Non-goals

- Image embeddings of screenshots in v0.1 (vision retrieval later)  
- Cross-lingual claims without eval  

## Acceptance (spec-era)

- Canonical string recipe documented and fixture golden string for aurora hero.  
- paths.json contains `designReferenceEmbeddings` stub.  
- Eval scenario lists expected neighbor relation (aurora ≈ product hero, not login form).
