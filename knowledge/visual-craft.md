# Visual craft (type / image / space)

**Date:** 2026-08-18  
**Config:** `knowledge/paths.json` → `visionPage`  
**Code:** `src/llm-eval-scenario.ts` `VISION_PAGE_PROMPT` · `src/vision-page.ts` · Library screen detail · prompt pack

Moodboard stills and editorial homepages are not “a hero plus cards”. The layout is the **relationship** between display type and photography: overlap, split wordmarks, staircase indents, grayscale reprises, motion blur, pill chrome against massive grotesk.

## Why the City Arcade screen felt thin

Live capture `vpc_97ce4ecf8a204c4ab4e0fedda6073623` (upload ingest) produced useful band looks, but the **page catalog** was:

- `overall_atmosphere: minimal_luxury`
- `typography_feel: bold editorial`
- `rebuild_hints`: “Use a CSS Grid… large, thin sans-serif”

That is not enough to hand an LLM. Missing: CITY/ARCADE cutting the photo, manifesto indent + weight rhythm, same building reused in grayscale, inverted feature card, ignore the pink ad strip.

CSS `derived/visual-language.json` cannot see this on still-image ingest (synthetic html/body/img DOM). Vision has to carry the craft.

## Artifact

`derived/vision-page.json` v0.2 adds `visual_craft`:

| Field | Job |
|-------|-----|
| `type_image_relationship` | How type sits on / over / through media |
| `typography_composition` | Scale, case, tracking, indent, weight/opacity |
| `imagery_craft` | Subject, crop, blur, reprise, treatment |
| `spatial_craft` | Whitespace, edge-hug, broken grid |
| `chrome_vs_content` | Tiny nav/pills vs editorial type |
| `rebuild_spec` | 8–14 sentences an implementer can follow |

Cache key includes `VISION_PAGE_VERSION` so a re-enrichment actually re-asks the model.

Re-run one capture (does not recapture the screenshot):

```
POST /api/enrichment
Authorization: Bearer $DIG_API_TOKEN
{ "capture_run_id": "cap_…" }
```

## Surfaces

- Library screen detail: **Visual craft** sits in the **Design brief** chapter directly under Design profile (`SpecAtomGrid` numbered cards). The same card grammar is reused for **UX assessment**, **Functionality**, and each **Section spec**. Rebuild spec spans the card row. Copy lives in `apps/web/lib/paths.ts` `libraryCopy`. Atoms: `apps/web/lib/spec-atoms.ts`.
- Copy prompt pack: `visual_craft` on the DesignPromptPack
- `derived/rebuild-brief.md`
- `design_summary` gets a Type/image + Type craft line (full spec stays on `visual_craft`)
