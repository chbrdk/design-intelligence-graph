# Cookie / CMP overlay handling (2026-08-17)

## Source

Ported from CHECKION [`lib/cookie-banner-dismiss.ts`](../../checkion/lib/scan/cookie-banner-dismiss.ts) plus `scan-visual-dismiss.ts` (early hide + retries + open-shadow clicks).

DIG modules:

- `src/cookie-banner-dismiss.ts` — Playwright capture
- `src/library-screenshot.ts` — Library cards prefer DIG Playwright full-page over CHECKION JPEG
- `src/consent-noise.ts` — text/taxonomy gate for look selection + `vision_section`

Config lives in [`paths.json`](paths.json) `cookieConsent` (retries, iframe URL pattern, CHECKION filename suffix). Do not hardcode those in capture/library code.

## Why Library still showed banners

Two stacked failures, common on OEM homepages (Hyundai, Stellantis, …):

1. **CHECKION JPEG overwrote the Library primary.** Attach keeps DIG `playwright_full_page_screenshot` for crops but sets `full_page_screenshot` to `checkion-full-page.jpg`. Library indexed that JPEG. CHECKION’s own dismiss often still leaves Sourcepoint/OneTrust chrome.
2. **DIG dismiss missed Sourcepoint / fixed banners.** Hide CSS had no `#sp_message_container_*` / `privacy-mgmt.com` iframes. Accept clicks used `offsetParent === null`, which is true for `position:fixed` CMP bars, so Accept never fired. No `addInitScript`, no retries, no open-shadow clicks.

## Capture (2026-08-17)

- `context.addInitScript` injects hide CSS + MutationObserver **before** navigation (CMP cannot paint first).
- After scroll-settle: dismiss with retries (`cookieConsent.retries` / `retryDelayMs`).
- Immediately before screenshots: a second dismiss (`cookieConsent.preScreenshotRetries`) because late CMPs often reappear after HTML capture.
- Later chrome/stabilize passes use `retries: 0`.
- Sourcepoint, Funding Choices, Borlabs, Consentmanager, CookieFirst, Osano, CookieConsent v3 (`#cc-main`), Iubenda, Klaro, Civic, Cookie Information, Cookie Script, HubSpot, Shopify privacy, Tealium/Evidon, TrustArc/Cookiebot iframes in hide CSS.
- Accept click uses `getComputedStyle` + box size (not `offsetParent`).
- Open shadow: Usercentrics + Funding Choices.
- CMP iframes matching `cookieConsent.iframeUrlPattern` also run the dismiss script.
- Late hosts (`#usercentrics-root`, Sourcepoint containers, privacy-mgmt iframes) are removed after click.

Intervention: `cookie_banner_dismiss_heuristic`. `capture_dimensions.consent_state`: `dismissed_heuristic`. Viewport warning: `cookie_banner_dismissed` (or `cookie_dismiss_failed:…`).

## Library

- Index (`db-index`) stores `playwright_full_page_screenshot` when present.
- HTTP/MCP/flow media rewrite `…/checkion-full-page.jpg` → `…/full-page.webp` so **already indexed** CHECKION cards show the dismissed DIG shot without recapture.
- CHECKION JPEG remains package SoT (`checkion_full_page_screenshot`) for WCAG / attach.

Existing cards change as soon as **dig-api** serves the rewrite. New captures also get a cleaner DIG shot after the dismiss port. Recapture still helps if the DIG webp itself had the banner (pre-fix).

## Crops / look / vision

Section crops prefer `artifacts.playwright_full_page_screenshot`. Consent noise gates are unchanged:

- `classifySection` → `dig:section.cookie_consent` when text matches
- `selectSectionsForLook` skips consent noise
- `shouldRunSectionVision` returns `consent_overlay`
- Post-VL: `isConsentOverlayVision` → skip merge

## Related

- [`section-crops-next.md`](section-crops-next.md) — crops + gated vision
- [`paths.json`](paths.json) `cookieConsent`
