# DesignReference (DIG-012) — knowledge index

**Spec:** [`docs/DIG-012-design-reference.md`](../docs/DIG-012-design-reference.md)  
**Challenge:** [`dig-011-challenge.md`](dig-011-challenge.md)  
**Fixtures:** `fixtures/design-references/`

## Why

LLMs need **compact, evidence-backed look + composition** packages — not only journey graphs or taxonomy ids — to produce individualized designs.

## Read order

1. ADR-012  
2. DIG-012 parent  
3. [Prompt pack](../docs/DIG-012-prompt-pack.md) · [Look-conditioned](../docs/DIG-012-look-conditioned-generation.md) · [Embeddings](../docs/DIG-012-embeddings.md) · [Eval](../docs/DIG-012-design-quality-eval.md)  
4. Schemas `design-reference*.schema.json`, `design-prompt-pack`, `design-layout-hints`  
5. Fixtures `aurora-hero` + pack + prompt-pack  
6. Section look source: [`section-look.md`](section-look.md)

## Agent loop (target)

```text
dig_screen_search(style, layout, industry)
  → dig_capture_prompt_pack(capture_run_id)
  → LLM / dig_generate(look_conditioned)
```

Alternate (section references):

```text
brief → dig_reference_search → dig_reference_pack
     → LLM and/or dig-generate(look_conditioned)
     → layout-spec with provenance.reference_ids
```

See [`mcp-library-loop.md`](mcp-library-loop.md).

## paths.json

`taxonomy.designReferenceSpec`, `designReferenceFixturesDir`, schemas keys under `taxonomy.schemas`.
