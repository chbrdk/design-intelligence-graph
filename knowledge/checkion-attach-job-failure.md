# CHECKION attach job failure (2026-08-15)

## Symptom

DIG capture job fails at stage “Capturing full-page screenshot via CHECKION” with:

`CHECKION non-JSON response: <!DOCTYPE html>… data-theme="msqdx-dark"`

## Cause

dig-api followed/received CHECKION **HTML login shell** instead of JSON (auth/redirect). DIG treated CHECKION as hard-required (`DIG_CHECKION_SCREENSHOTS=1` → `config.required`) and aborted the whole job after Playwright detection already succeeded.

## Fix

1. Soft-fail attach by default (`src/checkion-attach.ts`) — job continues; Playwright full-page kept
2. CHECKION client: `Accept: application/json`, `redirect: manual`, clearer HTML/redirect errors
3. Coolify: pin `CHECKION_PROJECT_ID=proj-msuphtrb`; dedupe `DIG_API_TOKEN`
4. Optional hard fail: `DIG_CHECKION_STRICT=1`

## Verify

- Local: `npm run smoke:checkion-peer` (token + staging)
- Re-run capture on dig UI after dig-api redeploy


## Deploy lag (2026-08-15 evening)

Coolify dig-api `updated_at` stayed at 18:27 while commits landed later — soft-fail code was not running yet.
Mitigation: set `DIG_CHECKION_SCREENSHOTS=0` + restart so attach is skipped on old image; job-runner now also try/catches attach errors.


## First complete capture after fix

- `job_20260815191047_7b389661` → `complete` (`cap_77177817a4d842329d275a2e47841932`, msqdx.com)
- dig-api redeployed `1b56592` (build unblocked); `DIG_CHECKION_SCREENSHOTS` re-enabled after success
