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

## What we do (best effort, public pages only)

| Step | Behavior |
|------|----------|
| Locale | Infer from host (`.de` → `de-DE`) or Europe timezone |
| Headers | `Accept-Language` matches locale |
| Chromium | `--disable-blink-features=AutomationControlled` (recorded intervention) |
| Navigate | CHECKION-style retries + wait for JS challenge (not a CAPTCHA solver) |
| Firefox | One engine fallback if Chromium still denied |
| Honesty | Viewport/run status `blocked` if the wall remains — do **not** treat it as the site |
| CHECKION | Still attach full-page JPEG; if that works, job continues without LLM on empty DIG DOM |

Not in this slice: residential proxies, captcha farms, stealth forks (Patchright), login bypass.

## Limits

If Tesla/Audi still deny the Coolify IP after retries, the job fails with `Capture blocked by site access control` unless CHECKION attached a screenshot. Re-capture from a residential network (headed CLI) is the remaining path.
