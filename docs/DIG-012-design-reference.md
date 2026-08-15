# DIG-012 — Design Reference Bundle

**Status:** Draft v0.1 — **specified, not implemented** (retrieval/generation contract)  
**Purpose:** Define the atomic package of design knowledge an LLM / DIG-008 consumer should retrieve to produce **better, more individualized** layouts  
**Motivation:** [`knowledge/dig-011-challenge.md`](../knowledge/dig-011-challenge.md)  
**Upstream:** DIG-002–005, DIG-010 section look, DIG-006 index, DIG-009 enrichment  
**Downstream (planned):** DIG-007 reference tools, DIG-008 style-conditioned generation, Library “Use as reference”  
**Optional context:** DIG-011 `flow_context` (thin)  
**Schemas:** [`design-reference.schema.json`](../schemas/design-reference.schema.json), [`design-reference-pack.schema.json`](../schemas/design-reference-pack.schema.json)  
**Fixtures:** `fixtures/design-references/`

---

## 1. Problem

Today’s agent path is:

```text
capture → graph → dig_recommend(taxonomy) → dig-generate(structural blocks)
```

That yields **structure without individuality**. DIG-010 already produces look/feel; it is not a first-class retrieval unit for MCP or generation.

DIG-012 introduces **DesignReference**: one section- or screen-scoped bundle of measured + semantic design knowledge, sized for LLM context and for conditioning DIG-008.

---

## 2. DesignReference (atomic)

A DesignReference MUST be self-contained enough that an LLM can answer: “How is this built, how does it feel, which evidence backs that?” without loading the full capture package.

### Required slices

| Slice | Layer | Source (existing) |
|-------|-------|-------------------|
| Identity | — | `reference_id`, `capture_run_id`, `scope` (`section` \| `screen`) |
| Taxonomy | L2/L3 | ontology / pattern ids, category |
| Composition | L2 | recipe signature, roles, gaps summary |
| Look | L3 | DIG-010 `section_descriptions` fields + `look_summary` |
| Tokens | L1/L2 | compact color/type/radius hints (from VL or measured) |
| Provenance | — | evidence_refs, confidences, methods |

### Optional slices

| Slice | When |
|-------|------|
| `page_context` | screen patterns, visual_style labels for the page |
| `flow_context` | DIG-011 `{ flow_action_ids[], prev_screen?, next_screen? }` — never required for single-surface design |
| `media_ref` | opaque path/URL to screenshot crop (not bytes in the bundle) |

### Non-goals for a single reference

- Full CSSOM / HTML  
- Raw node dumps  
- CHECKION issue lists  
- Interactive hotspot playback payloads  

---

## 3. DesignReferencePack (generation input)

A pack is what a design agent sends into generation or an LLM prompt:

```text
DesignReferencePack {
  intent: string                  // user brief
  references: DesignReference[]   // 1–8, ranked
  constraints?: { … }             // viewport, must_include taxonomy, avoid copy theft
  synthesis_mode: "structural" | "look_conditioned"   // DIG-008 today = structural only
}
```

Rules:

1. Pack MUST list references in preference order (index 0 = primary style anchor).  
2. Pack MUST NOT include source marketing copy beyond short `text_preview` stubs (privacy / IP).  
3. `look_conditioned` mode is **specified here**; DIG-008 v0.1 remains `structural` until an implementation wave maps look → token/block hints.

---

## 4. Size budget (normative for producers)

| Field group | Soft limit |
|-------------|------------|
| Entire DesignReference JSON | ≤ 4 KB serialized (target); hard fail > 12 KB |
| `look_summary` | ≤ 400 chars |
| `stack_summary` | ≤ 200 chars |
| `tokens` | ≤ 12 color entries, ≤ 6 type entries |
| `evidence_refs` | ≤ 24 ids |

Producers MUST truncate, not omit required keys.

---

## 5. Retrieval API (planned)

### Library

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/library/references` | Search by signature, category, look keywords, style labels |
| GET | `/api/library/references/:reference_id` | One bundle |
| POST | `/api/library/references/pack` | Body: ids[] + intent → DesignReferencePack |

### MCP (DIG-007 extension)

| Tool | Role |
|------|------|
| `dig_reference_search` | Faceted / substring search over indexed references |
| `dig_reference_get` | Fetch one bundle by id |
| `dig_reference_pack` | Assemble pack from ids + intent |

These are **higher priority for agent value** than `dig_flow_*` ([challenge](../knowledge/dig-011-challenge.md)).

Tool descriptor schema: [`schemas/mcp-reference-tools.schema.json`](../schemas/mcp-reference-tools.schema.json).

---

## 6. Indexing (planned)

When enrichment writes `section_descriptions`, indexing MUST also emit portable references:

- Package path: `derived/design-references.jsonl` (one JSON object per line)  
- Postgres (draft): `design_references` jsonb + optional embedding row  
- Graph: optional DIG-006 node type `design_reference` linking to ontology section entity  

Embeddings SHOULD hash or embed `look_summary + signature + style labels` (provider later); hashing stub may reuse `dig-hashing-v1`.

---

## 7. DIG-008 conditioning (spec delta)

See detailed mapping: [DIG-012-look-conditioned-generation.md](DIG-012-look-conditioned-generation.md).

Prompt assembly (no DIG-008 change): [DIG-012-prompt-pack.md](DIG-012-prompt-pack.md).

Embeddings / similarity: [DIG-012-embeddings.md](DIG-012-embeddings.md).

Design quality eval: [DIG-012-design-quality-eval.md](DIG-012-design-quality-eval.md).

Until Wave 4 is implemented, agents MAY use DesignReferencePack only as **LLM prompt context** beside `dig-generate`.

---

## 8. Relationship to DIG-011

```text
DesignReference  ←── primary unit for individualized design
      │
      └── optional flow_context (DIG-011) when brief is multi-screen
```

Do not require a Flow to exist before emitting references. Single-URL captures remain the main corpus.

---

## 9. Implementation waves (deferred)

| Wave | Deliverable |
|------|-------------|
| 0 | Spec + schemas + fixtures + validation tests | Done |
| 0b | Prompt-pack, look_conditioned mapping, embeddings, design eval specs | Done (spec-era) |
| 1 | Emit `derived/design-references.jsonl` from existing section_look at index/enrich time | Done (dummy) |
| 2 | Library + MCP search/get/pack | Not started |
| 3 | Prompt-pack helper for agents (no DIG-008 change) | Spec done; runtime not started |
| 4 | DIG-008 `look_conditioned` mode | Spec done; runtime not started |

---

## 10. Acceptance (spec-era)

- Fixtures validate against schemas.  
- Pack fixture includes ≥1 hero reference with look_summary mentioning compositional cues (scrim / centered CTA / stack).  
- Challenge doc links DIG-012 as the preferred agent-value path.

---

## 11. References

- DIG-010 / [`knowledge/section-look.md`](../knowledge/section-look.md)  
- [`knowledge/dig-011-challenge.md`](../knowledge/dig-011-challenge.md)  
- DIG-007 / DIG-008  
