# DIG-012 — Look-conditioned DIG-008 generation (Wave 4)

**Status:** Draft v0.1 — specified, **not implemented**  
**Parent:** [DIG-012](DIG-012-design-reference.md) · Upstream generator: [DIG-008](DIG-008-layout-generation.md)  
**Mapping table:** [`fixtures/design-references/look-conditioned-mapping.json`](../fixtures/design-references/look-conditioned-mapping.json)  
**Example output delta:** [`fixtures/design-references/aurora-layout-hints.expected.json`](../fixtures/design-references/aurora-layout-hints.expected.json)

## Goal

Define how a `DesignReferencePack` (and optional LLM `layout_hints`) **biases** deterministic layout generation without copying source text/assets or inventing fake node evidence.

## Intents

| Intent | Mode |
|--------|------|
| `evidence_based_structural_synthesis` | DIG-008 today — graph only |
| `look_conditioned_structural_synthesis` | Graph **or blank seed** + DesignReferencePack (+ optional layout_hints) |

`generation_version` bumps to `0.2.0` when look-conditioned ships (schema additive).

## Inputs

1. **Target graph** (optional): DIG-006 graph for a new or existing capture. If absent, generator uses a **blank seed**: empty ontology set + pack-driven block plan only (blocks then have `source_node_ids: []` and MUST set `provenance.seed = "blank_canvas"`).  
2. **DesignReferencePack** (required for this intent).  
3. **layout_hints** (optional): from Wave 3 LLM; if present, treated as L3 suggestions with confidence &lt; 1.

## Deterministic bias rules

Apply in order. Mapping fixture encodes the tables; code MUST NOT hardcode synonyms outside that fixture / `paths.json` pointer.

### B1 — Block plan from composition

1. Take primary reference `composition.signature` (e.g. `media>heading>cta`).  
2. Split on `>` → ordered roles.  
3. Map role → default taxonomy via mapping table (`media` → `dig:component.media`, …).  
4. If target graph has ontology entities for that taxonomy, attach their `source_node_ids`; else emit placeholder block with empty source ids only when `seed = blank_canvas` OR when hints explicitly allow placeholders.  
5. Prefer graph entities whose section/category matches reference `taxonomy.category` when multiple exist.

### B2 — Token slot fills

From primary reference `tokens`:

| Reference token | Layout-spec slot |
|-----------------|------------------|
| colors role accent/cta | `color_slots` keep name `accent`; record **hint value** in new optional `token_hints.colors.accent` |
| colors foreground/background | `token_hints.colors.foreground/background` |
| typography role display/heading | `token_hints.typography.heading` |
| radii[0] | `token_hints.shape.radius` |

DIG-008 v0.1 only emits slot **names**. Wave 4 ADDS optional `token_hints` object (values are hints for renderers/LLMs, not claimed L1 measurements of the target).

### B3 — Look directives → constraints

Map look fields to **constraint strings** (not CSS):

| Look cue | Constraint example |
|----------|-------------------|
| overlay.kind scrim/gradient | `Prefer lower-third dark scrim over media` |
| alignment.cta center | `Primary CTA centered` |
| alignment.text center | `Hero text centered` |
| shadows.targets includes cta | `Soft elevation on primary CTA` |
| media.role background | `Media as full-bleed background, not inline thumbnail` |

Merge unique constraints; cap at 12.

### B4 — layout_hints override (bounded)

If `layout_hints` present:

1. `proposed_signature` overrides B1 signature **only if** every role is in the mapping table.  
2. `token_hints` merge over B2 (hints win).  
3. `look_directives` / `avoid` append to constraints (prefix `hint:`).  
4. Record `methods` += `layout_hints_merge` and list `cited_reference_ids`.

### B5 — Provenance (mandatory)

```json
"provenance": {
  "graph_lineage_count": 0,
  "methods": ["look_conditioned_block_plan", "token_hints_from_reference"],
  "reference_ids": ["ref_aurora_hero"],
  "layout_hints_used": true,
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
