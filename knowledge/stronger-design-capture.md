# Stronger design capture — direction, visual language, structure (2026-08-16)

Learned from Porsche rebuild mock: DIG already delivers **direction** when synthesize + vision work; rebuild still invents tokens, nav IA, and below-fold rhythm.

## Gaps vs rebuild needs

| Need | Today | Gap |
| --- | --- | --- |
| Direction / archetype | synthesize + patterns | Fragile when JSON truncates; VL after synthesize |
| Visual language | page `visual-language.json` + style labels | Not packaged as **rebuild tokens** (type scale, radius, CTA chrome, scrim recipe) |
| Structure | sections + signatures | Hero-heavy; thin wrappers; **chrome open states** (shipping) |
| Media truth | gated `vision_section` + crops | Page `vision_screen` still flaky; overlays often CSS-blind |
| Multi-screen IA | DIG-011 parked | No models/configurator/nav destinations |

## Chrome open themes (nav and siblings)

Documented + implemented: [`chrome-states.md`](chrome-states.md)

Same pattern as nav open — detect trigger → open → screenshot + label tree → restore:

1. **nav_menu / mobile_nav** — mega-menu / hamburger  
2. **search_overlay** — search expand  
3. **account_drawer** — login / profile  
4. **cart_drawer** — mini-cart  
5. **lang_switcher** — market/locale  
6. **filter_drawer** — PLP filters  
7. **tab_panel / accordion** — in-page progressive disclosure  

Parked siblings: sticky-on-scroll header, carousel next, video playing.

## Highest-leverage next captures

### 1. Nav / chrome expand — **DONE (capture path)**

See `src/chrome-states.ts`. Next: optional LLM `chrome_ia` stage + Library thumbs.

### 2. Design token pack (visual language → usable)

Emit `derived/design-tokens.json` (and brief section) from measured evidence:

- Colors: top N fills/text from visual-language (hex + role guess: bg/ink/accent)
- Type: family + 3–5 sizes/weights from hero + body + CTA
- Shape: border-radius histogram (12/24px Porsche signal)
- Motion: prefers-reduced-motion + any measured transition durations
- Chrome recipes: primary CTA (fill/outline), scrim (gradient stops if inferred from vision)

Feed tokens into rebuild brief **before** freeform prose.

### 3. Structure spine (not more essays)

Per page:

- Ordered **band list**: category + signature + one beat (vision preferred)
- Explicit **above-fold recipe**: media / brand / headline / CTA / chrome
- Demote wrappers harder; promote recurring inventory/card grids

Optional: sticky/fixed chrome map (header height, footer density).

### 4. Destination samples (light multi-page)

Not full DIG-011 yet — **seeded follow captures**:

- Top 3 nav hrefs or “Modelle” / “Konfigurator” equivalents (can seed from chrome open_links)
- Same Collection; link as `related_captures[]`
- Enough for IA + second screen patterns without flow-graph product

### 5. Closed-loop rebuild brief

Brief must prefer:

1. tokens  
2. band spine  
3. chrome IA (nav/search/cart…)  
4. hero vision beat  
5. hypotheses  

Agent should refuse to invent fonts/colors when tokens present.

## Suggested order

1. Chrome open-state capture — **DONE**  
2. Token pack + brief schema  
3. Re-synthesize **after** vision_section  
4. Light related-URL captures from chrome links  
5. DIG-011 flows when Collection multi-screen is boring  

## Non-goals (for now)

- Pixel-perfect site clones  
- Opening every menu item  
- Replacing CHECKION for a11y/full-page JPEG SoT
