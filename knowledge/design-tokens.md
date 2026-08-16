# Design token pack (2026-08-16)

Measured visual language → rebuild-usable tokens.

## Artifact

`derived/design-tokens.json` (path: `knowledge/paths.json` → `designTokens.relativePath`)

Built after `derived/visual-language.json` during capture (desktop viewport preferred).

## Contents

| Block | Purpose |
| --- | --- |
| `roles.colors` | Top fills/text with role guess: `bg` / `ink` / `accent` / `muted` / `border` |
| `roles.typography` | `display` / `body` / `emphasis` / `small` with family + px + weight |
| `roles.radii` | Reasonable px radii (`sm`…`xl`) + optional `pill` |
| `roles.motion` | Animated flag + properties |
| `recipes` | Primary CTA + scrim + surface guesses for rebuild |
| `dtcg` | DTCG Format Module 2025.10-shaped primitives (`$type` / `$value`) |

Spec reference: https://www.designtokens.org/tr/2025.10/

## Rebuild brief

`## Design tokens (measured)` is emitted **first** (before page prose) when the artifact exists. Agents should refuse invented fonts/colors when tokens are present.

## Code

- `src/design-tokens.ts`
- Wired in `src/capture.ts`
- Consumed by `src/rebuild-brief.ts`
- Tests: `test/design-tokens.test.ts`
