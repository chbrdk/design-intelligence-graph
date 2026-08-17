# Look contract (hard constraints for generators)

**Date:** 2026-08-17  
**Version:** `0.1.0`  
**Code:** [`src/look-contract.ts`](../src/look-contract.ts)  
**Tokens:** [`derived/design-tokens.json`](../knowledge/paths.json) via `designTokens.relativePath`  
**Facets:** [`src/design-facets.ts`](../src/design-facets.ts) `look_contract` (`facets_version` `0.3.0`)  
**Prompt pack:** [`src/design-prompt-pack.ts`](../src/design-prompt-pack.ts) + [`schemas/design-prompt-pack.schema.json`](../schemas/design-prompt-pack.schema.json)

## Why

Vision facets describe *vibe* (`high-energy`, `full-bleed stacks`). Generators still invent glassmorphism, purple-blue gradients, and 16px card kits. The look contract binds **measured hex / type / radius / CTA chrome** plus a stable **`avoid[]`**.

## Shape

| Field | Source |
|-------|--------|
| `colors.bg / ink / accent` | `design-tokens.json` roles, else compact reference colors |
| `typography.display / body` | token type roles, else compact type |
| `radius_px` | CTA recipe or radii role |
| `cta_chrome` | `recipes.primary_cta.style` (`fill` / `outline` / `ghost`) |
| `density` | `vision_page.spacing_feel` → `tight` / `airy` / `uneven` |
| `avoid` | generic AI tropes + layout/style extras (e.g. full-bleed → “card grid in the hero”) |

`look_contract` **outranks** vibe adjectives in the brief. Prompt-pack `rules` include `lookContractRules()`.

## API

- Analysis: `GET /api/library/analyses/:id` → `package.design_facets.look_contract` (loads tokens from the capture package).
- Prompt pack: `POST /api/library/references/prompt-pack` accepts optional body `look_contract`; otherwise builds from primary-ref compact tokens and, when present, `derived/design-tokens.json` on that capture.

## UI

Library screen **Design profile** shows swatches, CTA/density/radius, and Avoid chips (`apps/web/components/screen-insight-strip.tsx`). Generic avoid-only contracts (no measured tokens) do not count as a profile signal.
