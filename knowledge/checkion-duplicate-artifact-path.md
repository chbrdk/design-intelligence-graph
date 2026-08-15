# CHECKION alias paths vs package verify (2026-08-15)

## Symptom

Capture jobs fail after a successful CHECKION attach:

`viewport_captures.desktop.full_page_screenshot repeats an existing artifact path`
(and/or `checkion_full_page_screenshot` / `run_artifacts.checkion_screenshot`)

## Cause

`applyCheckionScreenshotToPackage` intentionally aliases the same JPEG under:

- `run_artifacts.checkion_screenshot`
- `viewport_captures.desktop.checkion_full_page_screenshot`
- `viewport_captures.desktop.full_page_screenshot` (when replace is on)

`verifyCapturePackage` used to treat any repeated `artifact.path` as an error.

## Fix

Verify each unique path once; aliases are allowed when they share the same file.

## Related

- `src/checkion-attach.ts`
- `src/verify.ts`
- `knowledge/full-page-media.md`
