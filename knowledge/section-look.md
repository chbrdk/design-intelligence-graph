# Section look & feel (page scan → per-section tasks)

Added 2026-08-15.

## Product intent

Library entries should describe **how a section is built and how it feels**, not only its recipe signature.

Example (hero):

> Minimalist hero. Full-bleed background photo, dark gradient scrim over the lower half. Centered headline with an *italic* highlight span. Primary CTA centered below; soft drop shadow on the button. Stack: media → heading → CTA.

That is searchable (“gradient overlay”, “italic accent”, “centered CTA”) and useful for design intelligence — closer to editorial Mobbin notes than taxonomy tags alone.

## What we already have

| Layer | Source | Useful for look/feel? |
| --- | --- | --- |
| Section recipes / signatures | `derived/section-compositions.json` | Stack & roles (media, heading, cta) |
| Computed CSS | `styles/computed.jsonl` | `box-shadow`, `background-image`, `font-style`, `text-align`, opacity, filters |
| Visual language | `derived/visual-language.json` | Page-level shadows, fonts, colors (not section-scoped) |
| LLM stages today | `screen_patterns`, `ui_elements`, `section_recipes`, `visual_style`, `synthesize`, `vision` | Short labels / ≤160-char structural interpretations |

**Gap:** CSS evidence exists; prompts and schemas never ask for compositional prose or structured look fields per section.

## Implementation status

Implemented as **DIG-010** (`docs/DIG-010-section-look.md`):

- Wave B `section_look` after page-scan stages, before synthesize
- Cap: `paths.json` → `llm.scaling.sectionLookMaxSections` (default 8) or `DIG_LLM_SECTION_LOOK_MAX`
- Index kind `section_look` + UI Analyses panel

## Architecture (fits DIG-009)

```
Wave A — page scan (existing, parallel)
  screen_patterns | ui_elements | section_recipes | visual_style

Wave B — section tasks (new, parallel, budgeted)
  section_look × N sections
  Evidence: deterministic recipe + joined node CSS (+ optional page VL priors)
  Does NOT wait on LLM recipe_insights — uses measured SectionComposition

Wave C — synthesize
  Prior stages + section_look summaries → design_summary / hypotheses

Wave D — vision (existing)
  One page screenshot; later optional section crops
```

Why this split:

1. **Page scan** → cheap facets for library browse/search (Mobbin-like filters).
2. **Per-section tasks** → depth where designers care (hero, pricing, footer…).
3. Cache per `(section_id, evidence_hash)` so re-enrichment is cheap.
4. Cap **N** (default 6–8): above-fold / highest confidence / hero+CTA first.

Cost note: each section is another bulk call (~$0.0001–0.0002 on Qwen flash). At Mobbin volume, keep N capped and escalate only low-confidence sections to Luna.

## Proposed output schema (`section_descriptions`)

```ts
{
  section_id: string;
  signature: string;           // e.g. media>heading>cta
  category?: string;           // hero, …
  stack_summary: string;       // "full-bleed media → centered headline → CTA"
  background?: {
    kind: "solid" | "image" | "gradient" | "video" | "none";
    treatment?: string;        // "dark gradient scrim over photo"
  };
  overlay?: {
    present: boolean;
    kind?: "gradient" | "scrim" | "blur" | "other";
    notes?: string;
  };
  shadows?: {
    present: boolean;
    targets?: Array<"card" | "cta" | "text" | "container">;
    notes?: string;
  };
  typography_emphasis?: Array<"italic" | "bold" | "underline" | "all_caps" | "tight_tracking">;
  alignment?: {
    text?: "left" | "center" | "right";
    cta?: "left" | "center" | "right" | "full_width";
  };
  media?: {
    role: "background" | "hero" | "inline" | "none";
    object_fit?: string;
    notes?: string;
  };
  look_summary: string;        // 1–2 sentences how it looks / feels
  interaction_summary?: string; // CTA job / hierarchy
  confidence: number;
  evidence_refs: string[];     // node_ids, css props, taxonomy
}
```

Index as `llm_items` kind `section_look` (or store JSON on `llm_analyses` + items). Surface in Analyses / screen detail UI.

## Evidence pack per section (~≤2k tokens)

Join `recipe[].node_id` → computed styles (allowlist):

- `background-image`, `background-color`, `box-shadow`
- `font-style`, `font-weight`, `font-size`, `text-align`, `text-decoration-line`
- `opacity`, `filter`, `backdrop-filter`, `object-fit`
- flex/grid justify/align when present
- bbox relative to section root (centering heuristic)
- role + `text_preview` (truncated)

Also feed `shadow_values` into page-level `visual_style` evidence (today dropped).

## Implementation sketch (DIG-010)

1. `buildSectionLookEvidence(section, nodes)` in `src/section-look.ts`
2. Stage `section_look` in `llm-stages.ts` + wave B in `llm-design.ts`
3. Paths: `llm.scaling.sectionLookMaxSections` (default 8)
4. Migration for `llm_items` kind if needed
5. UI: analysis detail blocks for section look summaries
6. Fixture eval: marketing-hero expects gradient/scrim + centered CTA language

## Non-goals (v1)

- Full page redesign briefs
- Pixel-perfect Figma recreation from prose alone
- Vision crop per section (v2 if text+CSS confidence is weak)

## Related

- [`section-composition.md`](section-composition.md)
- [`llm-scaling-mobbin.md`](llm-scaling-mobbin.md)
- [`mobbin-parity.md`](mobbin-parity.md)
- [`enrichment-dashboard.md`](enrichment-dashboard.md)
