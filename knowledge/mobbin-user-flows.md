# How Mobbin indexes & describes user flows

Added 2026-08-15. Parity notes: [`mobbin-parity.md`](mobbin-parity.md), scaling: [`llm-scaling-mobbin.md`](llm-scaling-mobbin.md).

## Product model (not “LLM describes a journey”)

Mobbin treats **flows as a first-class library object**, same tier as screens / UI elements / apps:

| Object | What it is | How you find it |
| --- | --- | --- |
| **Flow** | Ordered multi-screen journey for one app version | `content_type=flows` + `flowActions.{Action}` |
| **Screen** | One captured frame in that journey | `screenPatterns.*`, `screenElements.*`, OCR |
| **Hotspot** | Tap/click region on screen *n* that advances to screen *n+1* | Interactive Mode (Figma-prototype UX) |
| **Flow action** | Controlled vocabulary label for the journey intent | Filter facet, not free prose |

Public scale (Mobbin marketing, 2026): hundreds of thousands of screens, ~300k+ flows. Search demand clusters on journey intents (“onboarding”, “checkout”, “login”).

## What makes indexing “useful”

### 1. Controlled journey taxonomy (`flowActions`)

Flows are tagged with a **closed action catalog**, e.g.:

- Onboarding, Logging In, Creating Account, Editing Profile  
- Filtering & Sorting, Chatting & Sending Messages  
- Subscribing & Upgrading, Browsing Tutorial, …

Search is **facet-first** (`filter=flowActions.Onboarding`), not “find me a paragraph about onboarding”. That keeps retrieval precise at corpus scale.

### 2. Ordered screen sequence (primary evidence)

A flow is a **list of screens with `order`**, scoped to an **app + app version**. Description of the journey is mostly structural:

```text
App / version
  └── Flow { actions[], name? }
        └── Screen[0..n] { order, patterns[], elements[], image }
              └── optional Hotspot { x, y, w, h, type } → next screen
```

Community API probes (e.g. MobbinAPI / MCP wrappers) expose the same shape: `actions[]`, ordered `screens[]`, per-step hotspot geometry.

### 3. Dual annotation per step

Each screen in the flow still carries **screen-level** facets:

- `screenPatterns` (Dashboard, Paywall, Empty state, …)
- `screenElements` (buttons, nav, inputs, …)

So you can ask either:

- “Show me **Onboarding** flows” (journey intent), or  
- “Show me screens with pattern **Empty state** inside any flow”

### 4. Hotspots = transition graph, not captions

Interactive Mode (changelog 2023-07): walk screen-by-screen by clicking hotspots (or anywhere if none). Hotspots encode **where the user acts to progress**, not a written explanation of the transition. That is how Mobbin makes flows *usable* for research without needing long narrative text.

Branching: flows can form a **tree** (`parentAppSectionId` / nested sections in reverse-engineered APIs) — not only a linear strip.

### 5. OCR + media, light editorial naming

- Screenshot OCR powers free-text search inside UI copy.  
- Optional **video** of the flow for micro-interactions/animations.  
- Flow/app naming is product/editorial; the **searchable intelligence** is taxonomy + sequence + hotspots + per-screen facets.

Mobbin is **not** primarily solving flows via generative “user journey summaries”. It solves them via **curated capture + facet ontology + ordered multi-screen packages**.

## Contrast with DIG today

| Mobbin | DIG (2026-08-15) |
| --- | --- |
| Multi-screen **app journey** as unit | Single-URL **page** capture |
| `flowActions` facet | No journey-action taxonomy yet |
| Hotspots link **screen → screen** | Hotspots = section/role boxes on **one** page (`library-api`) |
| `page_flow` n/a | `mobbin.page_flow` = ordered **sections within one page** (`section_recipes` stage) |
| Optional video of interaction | Vision on full-page still; `optionalHotspotFlow` budget reserved in `paths.json` |

DIG’s `page_flow` is closer to Mobbin **site-section narrative** (web landing scroll) than to Mobbin **iOS onboarding flow**. True flow parity needs: multi-URL / multi-state capture → ordered screen graph → `flowActions`-style labels → transition hotspots.

## Implications for DIG (when we build it)

1. **Separate entities:** `Flow` ≠ `Page` ≠ `Section look`.  
2. **Closed `flow_actions` catalog** (search facets) before free-text journey prose.  
3. **Store transitions** as edges with optional hotspot boxes (L1 geometry + L3 label).  
4. Keep LLM for **screen/section facets**; use LLM sparingly for flow titles — taxonomy + order do most of the retrieval work.  
5. Budget: `paths.json` → `llm.scaling.callsPerCaptureEstimate.optionalHotspotFlow` (placeholder for transition labeling).  
6. **No CHECKION/AUDION duplication** — see [`dig-checkion-boundary.md`](dig-checkion-boundary.md): URL discovery via CHECKION domain crawl; live journey agent stays AUDION/shared island; DIG owns the design-flow graph + facets; quality-on-step = CHECKION `mode: single` handoff.

## Sources (external)

- [Mobbin](https://mobbin.com/) product copy (flows, interactive hotspots)  
- [Interactive mode changelog](https://mobbin.com/changelog/2023-07-04-interactive-mode)  
- [Mobbin MCP blog](https://mobbin.com/blog/how-to-use-mobbin-mcp) (query mix: onboarding/login/checkout)  
- Reverse-engineered shapes: [underthestars-zhy/MobbinAPI](https://github.com/underthestars-zhy/MobbinAPI), [ismailsaleekh/mobbin-agent url-patterns](https://github.com/ismailsaleekh/mobbin-agent/blob/main/docs/reference/url-patterns.md), MCP wrapper issues (`get_flow_detail`, hotspot payloads)
