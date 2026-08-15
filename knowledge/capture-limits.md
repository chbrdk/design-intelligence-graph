# Capture payload limits

Large sites (e.g. apple.de) can blow past Node’s string size when serializing CSSOM/`cssText`, CDP matched styles, or concatenating JSONL in memory (`Invalid string length`).

## Canonical values

See `knowledge/paths.json` → `captureLimits`. Runtime mirror: `src/capture-limits.ts`.

## Mitigations

- Stylesheet CSSOM: style rules keep selector + declarations; no full `css_text`
- Matched styles mode (`matchedStylesMode`):
  - **`essential` (default)** — allowlisted design props only; no inherited/pseudo dump; low caps (200 nodes / 8 rules)
  - **`compact`** — previous capped CDP shape (`compactMaxMatched*`)
  - **`off`** — skip CDP matched styles; warning `matched_styles_omitted`; no `matched.jsonl`
- HTML: truncate via `boundUtf8Text` when over `maxHtmlBytes`
- JSONL: stream with `writeJsonLinesArtifact` (no giant in-memory join)

## Re-test

After changing limits, re-run `npm run build` then capture `https://www.apple.de` with all canonical viewports.