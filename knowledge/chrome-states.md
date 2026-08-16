# Chrome / overlay open states (2026-08-16)

Sibling to hover/focus in `states.ts`: **open transient chrome**, capture IA + screenshot, restore.

## Kinds (like “nav open”)

| Kind | Example | Why for rebuild |
| --- | --- | --- |
| `nav_menu` | Modelle mega-menu / desktop flyout | Primary IA labels + depth |
| `mobile_nav` | Hamburger sheet | Mobile structure |
| `search_overlay` | Search expand / modal | Findability chrome |
| `account_drawer` | Login / Mein Konto | Auth entry patterns |
| `cart_drawer` | Mini-cart | Commerce chrome |
| `lang_switcher` | DE/EN / market | Locale chrome |
| `filter_drawer` | PLP filters | Catalog UX |
| `tab_panel` | In-section tabs | Local IA |
| `accordion` | FAQ / summary | Content progressive disclosure |

Also related (not always auto-open): sticky scrolled header, media carousel next, video play — park until nav/search/cart are boring.

## Pipeline

```
cookie dismiss
  → default page screenshots (unchanged)
  → hover/focus safe states
  → chrome open (max 4, one per kind) → screenshot + labels/links → Escape/toggle restore
  → scroll / stabilize …
```

Artifacts:

- `viewports/{vp}/chrome-states/index.json`
- `viewports/{vp}/chrome-states/{kind}_{n}.webp`
- desktop rollup: `derived/chrome-states.json`

Config: `paths.json` → `chromeStates.maxOpens` / `DIG_CHROME_STATES_MAX`.

## Safety

- Skip cookie/CMP triggers
- Prefer header-scoped nav
- Restore before continuing capture
- Soft-fail never blocks package

## Rebuild brief

`rebuild-brief` includes a **Chrome IA** section when `derived/chrome-states.json` exists.

## Code

- `src/chrome-states.ts`
- Wired in `src/capture.ts`
- Tests: `test/chrome-states.test.ts`
