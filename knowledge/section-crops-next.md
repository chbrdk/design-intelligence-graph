# Section crops — next depth lever (2026-08-16)

## Idea

Detect sections → crop each (or a budgeted subset) from the full-page/settled screenshot → store as artifacts → feed into `section_look` / DesignReference `media_ref` (`kind: section_crop`).

Already foreshadowed in:

- [`section-look.md`](section-look.md) Wave D: “later optional section crops”
- [`design-reference.schema.json`](../schemas/design-reference.schema.json) `media_ref.kind: section_crop`
- DIG-001: clipped screenshots as optional derivative evidence

## Verdict

**Yes — but selective, not every section every time.**

Today’s text+CSS `section_look` already yields strong editorial notes when recipes are rich. Crops help where measurement is weak: overlay type on media, atmosphere, real CTA chrome, car imagery vs logo strip.

## When to crop (smart gate)

Crop only if **all** hold:

1. Section selected for look (existing budget, max ~14)
2. Geometry sane: height 120–1600px, width ≥ 280, not a page-wrapper (`body`/`unknown` ≥ ~3k px)
3. **Need vision** — at least one of:
   - signature thin (`media` only / `body` / `unknown`)
   - `section_look.confidence` < 0.7 after text pass
   - category in `{hero, feature, conversion, commerce}`
   - media role present

Skip nav chrome & giant wrappers unless explicitly requested.

## Pipeline sketch

```
derive sections (L2 geometry)
  → selectSectionsForLook
  → crop N ≤ sectionLookMaxSections from desktop full-page (or settled+scroll map)
  → store viewports/desktop/sections/{section_id}.webp + bbox meta
  → section_look text first (cheap)
  → optional vision_section on crop when gate fires (Wave D.2)
  → DesignReference.media_ref → section_crop path
```

## Costs / risks

| Risk | Mitigation |
| --- | --- |
| Payload size (we already hit VL limits on full-page) | Crops are small; prefer webp ≤ ~400kb |
| Wrong bbox / sticky overlap | Pad 8–16px; record occluders; prefer desktop |
| Duplicate with page vision | Keep one page vision; section vision only gated |
| Storage growth | Cap N; delete orphans on re-capture |

## Suggested order of work

1. **Section crop artifacts** (deterministic, no LLM) — bbox → webp + manifest paths — **DONE 2026-08-16**
   - `src/section-crops.ts` → `viewports/{vp}/sections/{section_id}.webp` + `derived/section-crops.json`
   - Wired in capture + enrich; `crop_path` on `llm_items.gaps`; Library/Analyses thumbs via `crop_url`
2. **Library UI thumbs** per section_look row — **DONE** (Island Library + Analyses)
3. **Gated `vision_section`** stage (reuse `llm-vision` loader/size caps)
4. Merge vision notes into `look_summary` / `role_notes` when text confidence low
5. Emit `media_ref.kind=section_crop` on DesignReferences

Do **not** block on DIG-011 flows for this.
