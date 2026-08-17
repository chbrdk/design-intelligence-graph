# DIG-012 — Look-conditioned DIG-008 generation (Wave 4)

**Status:** v0.4 — **implemented** (`src/look-conditioned-generation.ts`, `generation_version` `0.4.0`)  
**Parent:** [DIG-012](DIG-012-design-reference.md) · Upstream generator: [DIG-008](DIG-008-layout-generation.md)  
**Mapping table:** [`fixtures/design-references/look-conditioned-mapping.json`](../fixtures/design-references/look-conditioned-mapping.json)  
**Look contract:** [`knowledge/look-contract.md`](../knowledge/look-contract.md)  
**Page rhythm:** [`knowledge/page-rhythm.md`](../knowledge/page-rhythm.md)  
**Example output delta:** [`fixtures/design-references/aurora-layout-hints.expected.json`](../fixtures/design-references/aurora-layout-hints.expected.json)

## Goal

Define how a `DesignReferencePack` (and optional LLM `layout_hints`) **biases** deterministic layout generation without copying source text/assets or inventing fake node evidence.

## Intents

| Intent | Mode |
|--------|------|
| `evidence_based_structural_synthesis` | DIG-008 today — graph only |
| `look_conditioned_structural_synthesis` | Graph **or blank seed** + DesignReferencePack (+ optional layout_hints) |

`generation_version` `0.4.0` when page-rhythm drives the block plan (schema additive; `0.3.0` still valid for look-contract-only specs).

## Inputs

1. **Target graph** (optional): DIG-006 graph for a new or existing capture. If absent, generator uses a **blank seed**: empty ontology set + pack-driven block plan only (blocks then have `source_node_ids: []` and MUST set `provenance.seed = "blank_canvas"`).  
2. **DesignReferencePack** (required for this intent).  
3. **layout_hints** (optional): from Wave 3 LLM; if present, treated as L3 suggestions with confidence &lt; 1.

## Deterministic bias rules

Apply in order. Mapping fixture encodes the tables; code MUST NOT hardcode synonyms outside that fixture / `paths.json` pointer.

### B1 — Block plan from composition

0. If `page_rhythm.bands` exist, **those bands** become the block plan (`category_to_taxonomy`); this outranks `layout_hints.proposed_signature`.  
1. Else take primary reference `composition.signature` (e.g. `media>heading>cta`).  
2. Split on `>` → ordered roles.  
3. Map role → default taxonomy via mapping table (`media` → `dig:component.media`, …).  
4. If target graph has ontology entities for that taxonomy, attach their `source_node_ids`; else emit placeholder block with empty source ids only when `seed = blank_canvas` OR when hints explicitly allow placeholders.  
5. Prefer graph entities whose section/category matches reference `taxonomy.category` when multiple exist.

### B2 — Token slot fills

From primary reference `tokens`, then **overwrite** with `look_contract` (measured hex/type/radius/CTA/density). Compact reference fills gaps only.

| Source | Layout-spec slot |
|--------|------------------|
| look_contract.colors.accent / compact accent/cta | `token_hints.colors.accent` |
| look_contract.colors.ink / compact foreground | `token_hints.colors.foreground` |
| look_contract.colors.bg / compact background | `token_hints.colors.background` |
| look_contract.typography.display | `token_hints.typography.heading` |
| look_contract.radius_px | `token_hints.shape.radius` |
| look_contract.cta_chrome / density | `token_hints.shape.cta_chrome` / `density` |

DIG-008 v0.1 only emits slot **names**. Wave 4 ADDS optional `token_hints`; `0.3.0` attaches `look_contract` on the spec.

### B3 — Look directives → constraints

Map look fields to **constraint strings** (not CSS):

| Look cue | Constraint example |
|----------|-------------------|
| overlay.kind scrim/gradient | `Prefer lower-third dark scrim over media` |
| alignment.cta center | `Primary CTA centered` |
| alignment.text center | `Hero text centered` |
| shadows.targets includes cta | `Soft elevation on primary CTA` |
| media.role background | `Media as full-bleed background, not inline thumbnail` |

Merge unique constraints; cap at `lookContract.generateConstraintCap` (20). Look-contract rules + `avoid:` lines are inserted **before** mapping cues so they are not sliced off.

### B4 — layout_hints override (bounded)

If `layout_hints` present:

1. `proposed_signature` overrides B1 signature **only if** every role is in the mapping table.  
2. `token_hints` **fill empty slots only** — measured `look_contract` colors/type/radius/CTA win.  
3. `look_directives` / `avoid` append to constraints (prefix `hint:`).  
4. Record `methods` += `layout_hints_merge` and list `cited_reference_ids`.

### B5 — Provenance (mandatory)

```json
"provenance": {
  "graph_lineage_count": 0,
  "methods": ["look_conditioned_block_plan", "token_hints_from_reference", "look_contract_token_hints"],
  "reference_ids": ["ref_aurora_hero"],
  "layout_hints_used": true,
  "look_contract_used": true,
  "seed": "blank_canvas"
}
```

### B6 — Forbidden

- Copying `look_summary` verbatim into layout-spec as user-visible copy  
- Embedding reference media paths as required assets  
- Setting block `source_node_ids` to foreign capture node ids (other runs) — only target graph ids allowed  

## Schema delta (planned)

Additive fields on layout-spec (do not break v0.1 readers that ignore unknowns):

- `intent` enum extends with `look_conditioned_structural_synthesis`  
- `token_hints?: { colors?, typography?, shape? }`  
- `provenance.reference_ids?: string[]`  
- `provenance.seed?: "graph" | "blank_canvas"`  
- `provenance.layout_hints_used?: boolean`  

Document in a future `layout-spec.schema.json` bump to `0.2.0` at implement time; until then fixtures live under DIG-012.

## Acceptance (spec-era)

- Mapping table validates + covers roles used in aurora signature.  
- Expected aurora hints fixture matches B1–B3 outputs from aurora reference (pure function test when implement; for now structural checks in tests).  
- Forbidden rules listed and cited by tests reading this doc.
