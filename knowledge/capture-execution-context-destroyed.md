# Capture: Execution context destroyed (navigation)

**Date:** 2026-08-16  
**Example job:** `job_20260816202513_e220b350`  
**URL:** `https://msq.com/`

## Symptom

Job fails in ~3s at capture (`stage: failed`), before enrichment/vision:

```
page.evaluate: Execution context was destroyed, most likely because of a navigation.
```

Message often repeats 3× joined by `; ` — one failure per canonical viewport (`job-runner` joins `manifest.errors`).

## Cause

Site navigates (JS `window.location`, meta refresh, or soft redirect) while Playwright is still in `page.evaluate` during post-`goto` settle (`stabilizePage` fonts/mutations, sometimes scroll settle).

Parking / for-sale domains (e.g. `msq.com` → XHR then redirect to `resultlookup.com`) are a common trigger. Official MSQ agency site is `https://www.msqpartners.com/`, not `msq.com`.

## What it is not

Not LLM/vision/OpenRouter. Capture never produced a package.

## Mitigations (product)

1. Use the real brand URL when the short domain is parked.
2. Optional hardening: retry `stabilizePage` / early evaluates after `waitForLoadState("domcontentloaded")` when Playwright reports context destroyed; treat repeated navigations as partial capture with warning rather than hard-fail all viewports.
