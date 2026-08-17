# Capture access barriers (Tesla, Audi, Akamai, Cloudflare)

**Date:** 2026-08-17  
**Config:** `knowledge/paths.json` → `captureNav`  
**Code:** `src/capture-nav.ts` · wired from `src/capture.ts` + `src/job-runner.ts`  
**Peer:** CHECKION `apps/web/lib/scan/scan-bot-guard.ts` + `scan-goto.ts`

## Problem

Public captures of `tesla.com` and `audi.de` often land on **Access Denied** / WAF interstitials. DIG then used to snapshot that wall as if it were the product page (wrong Library look).

Typical causes on Coolify:

1. **Locale × timezone mismatch** — jobs used `en-US` with `Europe/Berlin`.
2. **No challenge wait** — Cloudflare “just a moment” never got time to clear.
3. **No retry** on HTTP 403 / Akamai static denial.
4. **15s job timeout** — too short for a 45s challenge wait.
5. **Datacenter IP** — Akamai/Tesla can hard-ban the Coolify host. No header fix covers that.
6. **HeadlessChrome + desktop flags** — Playwright default UA on Linux often contains `HeadlessChrome`; `hasTouch`/`isMobile` were always false even at 390×844.
7. **Audi “Site currently not available”** — OneAudi/Akamai interstitial (HTTP 200). DIG used to index it as the product page because the phrase was not in the barrier list.

## What we do (best effort, public pages only)

| Step | Behavior |
|------|----------|
| Locale | Infer from host (`.de` → `de-DE`) or Europe timezone |
| Headers | `Accept-Language` matches locale; Chromium also sends `Accept`, `sec-ch-ua*` and `Upgrade-Insecure-Requests` |
| User-Agent | Host-OS Chrome UA from `captureNav.chromiumUserAgentTemplates` (Linux on Coolify, macOS locally). Strips `HeadlessChrome`. Same UA across viewports — not a fake Windows desktop on Linux |
| Viewport flags | `isMobile`/`hasTouch`/`sec-ch-ua-mobile` follow viewport name (mobile vs tablet vs desktop) |
| Geo | Berlin (`captureNav.geolocation`) + `geolocation` permission |
| Chromium | `--disable-blink-features=AutomationControlled` and drop `--enable-automation` |
| Navigate | CHECKION-style retries + wait for JS challenge (not a CAPTCHA solver) |
| Firefox | Engine fallback on **desktop only** (library primary) — do not spend it on tablet |
| Honesty | Viewport/run status `blocked` if the wall remains — do **not** treat it as the site |
| Audi wall | Title/body `Site currently not available` / `Seite vorübergehend nicht erreichbar` → `site_unavailable` (hard block, same as Access Denied) |
| Remaining viewports | Always attempt every viewport. Skipping desktop after a tablet block hid Tesla behind an Access Denied stub |
| Library | List only `complete`/`partial` viewports (`captureNav.libraryListedStatuses`) so blocked Access Denied cards are not the Tesla thumbnail |
| CHECKION | Attach with `waitForCompletion: false` + poll ≤ 45s and HTTP fetch ≤ 20s (`checkionV3.attachPollTimeoutMs` / `attachFetchTimeoutMs`). Timeout is a **soft skip** unless `DIG_CHECKION_STRICT=1` |

Not in this slice: residential proxies, captcha farms, stealth forks (Patchright), login bypass.

## Limits

Extra User-Agent / Client-Hint meta can fix **HeadlessChrome** and mobile/desktop flag mismatch. It does **not** beat a datacenter-IP hard ban (Akamai JA4 / IP reputation). If Tesla/Audi still deny the Coolify IP after retries, the job fails with `Capture blocked by site access control` unless CHECKION attached a screenshot. Re-capture from a residential network (headed CLI) is the remaining path.

Do **not** spoof Windows Chrome on the Linux Playwright image — UA/TLS mismatch scores worse than a coherent Linux Chrome.

## Job hang then verify fail (2026-08-17)

`job_20260817114623_b8a46617` (`https://tesla.com/`):

1. DIG Playwright ran ~5.5 min (Chromium retries + Firefox **per viewport**).
2. Stage sat on **Capturing full-page screenshot via CHECKION** (`waitForCompletion: true`, poll default 300s, no fetch abort).
3. Job then **failed** at 11:53Z during verify: `capture_status: partial`, error was a dump of duplicate `ont_*` / `rel_*` ids (verify hard-fails the job). LLM enrichment had already been queued (`enr_20260817115259_f8fbc410`).

`job_20260817120252_7846e1d2` (after hang fix): capture finished in ~2.5 min as `partial`, then verify failed with `nodes_artifact_missing:tablet/desktop` (skipped blocked viewports had no `nodes.jsonl`) plus the same duplicate ontology ids.

Fixes: write empty `nodes.jsonl` for blocked/skipped/failed viewports; verify does not require DOM artifacts when status is `blocked`/`failed`; ontology `add()` and `uniquifyOntologyViewports()` drop/rekey duplicate ids before the package is written.

## Desktop Access Denied while mobile works (2026-08-17)

Latest Tesla `cap_8d64dd2699c2467983c18a183b194517`: **mobile** captured the real homepage (`Electric Cars, Solar & Clean Energy | Tesla`); tablet hit Access Denied; desktop was **stubbed never-run** because skip-remaining fired after tablet. Library sorts `desktop` first, so the Tesla card was Access Denied.

Firefox had already been used on tablet, so desktop never got the engine fallback.

Change: try every viewport; Firefox only for `captureNav.firefoxFallbackViewport` (`desktop`); library omits `blocked` viewports. Tesla desktop may still be Akamai-banned on desktop UA — then the library shows the working mobile capture instead of the wall.
