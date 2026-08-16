# Cookie / CMP overlay handling (2026-08-16)

## Source

Ported from CHECKION [`lib/cookie-banner-dismiss.ts`](../../checkion/lib/cookie-banner-dismiss.ts): CSS hide for major CMPs + multilingual Accept click.

DIG modules:

- `src/cookie-banner-dismiss.ts` — Playwright capture (after scroll-settle, again before stabilized shot)
- `src/consent-noise.ts` — text/taxonomy gate for look selection + `vision_section`

## Capture

- Intervention: `cookie_banner_dismiss_heuristic`
- `capture_dimensions.consent_state`: `dismissed_heuristic`
- Viewport warning: `cookie_banner_dismissed` (or `cookie_dismiss_failed:…`)
- Usercentrics (`uc-layer` / `uc-layer2` / `#usercentrics-root`) is CSS-hidden and force-disabled so chrome opens (nav Menü) are not pointer-blocked.

## Crops

Section crops prefer `artifacts.playwright_full_page_screenshot` (DIG capture after dismiss). CHECKION JPEG remains page SoT / Library primary but can still include late CMP chrome.

## Look / vision

- `classifySection` → `dig:section.cookie_consent` / `cookie_consent` when text matches
- `selectSectionsForLook` skips consent noise
- `shouldRunSectionVision` returns `consent_overlay` (no VL tokens on CMP chrome)
- Post-VL: `isConsentOverlayVision` → status `skipped` / `consent_overlay_vision` (no merge into look)

## Related

- [`section-crops-next.md`](section-crops-next.md) — crops + gated vision
