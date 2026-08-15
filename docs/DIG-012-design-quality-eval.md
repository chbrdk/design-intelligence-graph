# DIG-012 — Design quality eval (references → hints)

**Status:** Draft v0.1 — specified, **not implemented** as a runner  
**Parent:** [DIG-012](DIG-012-design-reference.md)  
**Related:** [`knowledge/llm-quality-eval.md`](../knowledge/llm-quality-eval.md) (enrichment quality ≠ generation quality)  
**Scenario dir:** `fixtures/eval/design-reference-hero/`

## Distinction

| Eval | Measures |
|------|----------|
| `llm-quality-eval` | Staged enrichment / vision on a page |
| **design-reference eval** | Retrieval + prompt-pack + (optional) layout_hints quality for individualized design |

## Scenario: `design-reference-hero`

Inputs:

- Brief: “Premium centered product launch hero; clear primary CTA; no copy theft.”  
- Corpus fixtures: `aurora-hero.reference.json`, `login-form.reference.json`  
- Golden:

```json
{
  "expected_primary_reference_id": "ref_aurora_hero",
  "forbidden_primary_reference_id": "ref_shop_login_form",
  "expected_signature_roles": ["media", "heading", "cta"],
  "expected_look_keywords": ["scrim", "center", "cta"],
  "expected_token_accent_present": true,
  "forbid_source_phrases": ["Aurora Phone", "Learn more"]
}
```

## Scoring tracks (0–100 each)

### R1 — Retrieval

Given brief keywords / category `hero`, does search rank `ref_aurora_hero` above login?

- 100 if primary match  
- 50 if in top-3 only  
- 0 otherwise  

### R2 — Prompt pack integrity

Assembled pack:

- includes hard rules  
- primary ref is aurora  
- size ≤ 12 KB  
- no full evidence dumps  

### R3 — Layout hints (LLM optional)

If a model produces `layout_hints_json`:

- valid schema  
- `proposed_signature` contains media/heading/cta  
- `cited_reference_ids` includes aurora  
- output text/JSON must **not** contain forbid_source_phrases  
- look_directives hit ≥2 expected_look_keywords  

### R4 — Look-conditioned mapping (deterministic)

Run B1–B3 mapping on aurora reference without LLM:

- block roles match expected_signature_roles  
- token_hints.accent present  
- ≥2 look constraints emitted  

**overall** = mean of run tracks (skip R3 if no key).

## Runner (planned)

```bash
npm run eval:design-reference
```

Not wired yet. Until then, contract tests cover R2 fixtures + R4 mapping table presence.

## Non-goals

- Human preference A/B at scale  
- Pixel visual regression of rendered layouts (renderer not in scope)
