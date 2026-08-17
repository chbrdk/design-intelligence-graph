# DIG-012 — Agent Prompt Pack (Wave 3)

**Status:** v0.1 — **implemented** (`src/design-prompt-pack.ts`)  
**Parent:** [DIG-012 Design Reference](DIG-012-design-reference.md)  
**Fixture:** [`fixtures/design-references/prompt-pack.aurora.json`](../fixtures/design-references/prompt-pack.aurora.json)  
**Schema:** [`schemas/design-prompt-pack.schema.json`](../schemas/design-prompt-pack.schema.json)

## Goal

Turn a `DesignReferencePack` into a **bounded, reproducible LLM prompt envelope** so agents produce individualized designs without dumping full captures or copying source marketing copy.

This wave does **not** change DIG-008. It only defines how to talk to an LLM (or future tool) with DIG knowledge.

## Envelope shape

```text
DesignPromptPack {
  schema_version: "0.1.0"
  role: "design_synthesis"
  brief: string                         // user intent
  rules: string[]                       // hard constraints
  references: CompactReference[]        // ≤8, already size-bounded
  ask: string                           // structured output instruction
  output_contract: "layout_hints_json" | "prose_brief" | "both"
  look_contract?: LookContract          // measured hex/type/radius/CTA + avoid[]
  page_rhythm?: PageRhythm              // page_arc + bands; outranks card-kit templates
}
```

`CompactReference` is a DesignReference with optional fields dropped to stay under token budget (see § Budgets).

## Hard rules (MUST appear in every pack)

1. Do not copy source marketing headlines, body copy, or brand names from references unless the brief explicitly asks to redesign *that* product.  
2. Do not invent measured geometry; treat gaps/roles as structural hints.  
3. Prefer primary reference (index 0) for look; secondary refs only for contrast or missing roles.  
4. Cite `reference_id`s in the output when making look claims.  
5. Separate **structure** (signature, roles, taxonomy) from **feel** (look_summary, tokens).  
6. If `forbid_source_copy` is true on the pack, treat it as absolute.  
7. If `look_contract` is present, it outranks vibe adjectives; obey `look_contract.avoid` and measured colors/type/radius/CTA (no glassmorphic defaults).
8. If `page_rhythm` is present, it outranks generic landing-page / card-kit structure; follow `page_arc`.

## Templates

### T1 — `layout_hints_json` (default for agents → DIG-008 later)

Ask the model to return ONLY JSON:

```json
{
  "primary_reference_id": "ref_…",
  "proposed_signature": "media>heading>cta",
  "block_plan": [
    { "role": "media", "notes": "full-bleed; no logo lockup" },
    { "role": "heading", "alignment": "center" },
    { "role": "cta", "alignment": "center", "emphasis": "primary" }
  ],
  "token_hints": {
    "accent": "#0071e3",
    "foreground": "#1d1d1f",
    "background": "#f5f5f7",
    "radius": "18px",
    "type_display": "sans bold large"
  },
  "look_directives": [
    "dark gradient scrim over lower media",
    "single primary CTA, soft shadow"
  ],
  "avoid": ["multi-CTA hero", "left-aligned sales stack"],
  "cited_reference_ids": ["ref_…"]
}
```

Schema for this JSON: [`schemas/design-layout-hints.schema.json`](../schemas/design-layout-hints.schema.json).

### T2 — `prose_brief`

Short creative direction (≤200 words) for humans or freeform LLMs, still citing reference ids and forbidding copy theft.

### T3 — `both`

Emit `layout_hints_json` first, then a ≤80-word prose rationale.

## Assembly algorithm (deterministic)

Given `DesignReferencePack` P:

1. Sort references as given (already preference-ordered).  
2. For each reference, build CompactReference keeping: identity, taxonomy.category, composition.{signature,stack_summary,roles}, look.{look_summary,alignment,overlay,shadows,background,confidence}, tokens (truncated to 6 colors / 3 type rows / style_labels), optional flow_context.flow_action_ids only.  
3. Drop `evidence_refs` beyond 8; drop `page_context.design_summary` if total pack > budget.  
4. Inject `rules` from § Hard rules + pack.constraints.  
5. Set `ask` from `output_contract` template T1/T2/T3.  
6. Emit DesignPromptPack.

## Budgets

| Item | Limit |
|------|-------|
| Prompt pack JSON | ≤ 12 KB |
| CompactReference each | ≤ 2.5 KB |
| references count | 1–5 preferred (max 8) |
| look_summary | ≤ 280 chars after compact |

## Non-goals

- Calling a provider (Wave 3 is assembly only; eval harness may call later)  
- Mutating DIG-008 layout-spec  
- Multi-turn chat memory  

## Acceptance (spec-era)

- Fixture `prompt-pack.aurora.json` validates schema.  
- Contains hard-rule strings and aurora `reference_id`.  
- Derived `layout_hints` example validates `design-layout-hints.schema.json`.
