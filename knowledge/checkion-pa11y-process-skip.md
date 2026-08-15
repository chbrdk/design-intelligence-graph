# CHECKION attach soft-skip: pa11y `process` (2026-08-15)

## Symptom (DIG job events)

```text
CHECKION screenshot skipped: Cannot read properties of undefined (reading 'process')
runCodeSniffer (pptr:evaluate;injectRunners … pa11y.js)
```

Capture continues: Verify → Ingest → Complete; LLM enrichment still queues.

## Meaning

- DIG soft-fails CHECKION attach (`DIG_CHECKION_STRICT` unset) — correct.
- Failure is **inside CHECKION v3’s pa11y runners** (axe/htmlcs inject), not DIG’s Playwright capture.
- Screen SoT for that run stays DIG Playwright `full-page.webp` / settled shots.

## DIG side

- Client: `src/checkion-client.ts` → `mode: "single"` full WCAG scan (CHECKION has no screenshot-only mode today).
- Soft-fail: `src/checkion-attach.ts` / job-runner try/catch.

## Peer fix (CHECKION)

pa11y `injectRunners` evaluates code that touches Node `process` in the page context. Fix in checkion-v3 / pa11y version pin — not in DIG.

## Ops

- Enrichment after skip is still valid (verified `enr_*` complete).
- Re-try attach after CHECKION deploy that patches pa11y; or set `DIG_CHECKION_SCREENSHOTS=0` to skip the peer call entirely.
