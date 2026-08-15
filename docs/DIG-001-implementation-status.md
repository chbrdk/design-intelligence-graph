# DIG-001 Implementation Status

**Implementation:** `dig-capture` 0.1.0  
**Specification:** DIG-001 Draft v0.1  
**Assessment date:** 2026-08-14

## Canonical MVP status

The runnable implementation satisfies the ten requirements in DIG-001 §53 for a minimum viable canonical capture. A run is only `complete` when all requested viewports succeed; subsystem warnings produce `partial`, and failures remain explicit.

| DIG-001 area | Status | Current evidence |
|---|---|---|
| Identity, environment, variants | Implemented | Stable Site/Page/Run/Viewport IDs; browser, locale, timezone, theme, motion, consent/auth/personalization dimensions |
| Load and stabilization | Implemented | DOM quiet window, font readiness, bounded timeout, settled and animation-stabilized phases |
| HTML and DOM | Implemented | Privacy-sanitized source/rendered HTML, capture-local IDs, anchors, DOM paths, open shadow traversal |
| Text | Implemented | Raw/normalized text, language, direction, writing mode, counts, truncation and line boxes |
| Geometry and layout | Implemented | Floating-point boxes, normalized document/viewport geometry, box model, client rects, flex/grid/position context |
| CSS and visual properties | Implemented | Canonical computed subset, CSSOM sources, conditional rules, custom properties, matched cascade, normalized sRGB usage |
| Assets and fonts | Implemented | Image/video/SVG/canvas/background metadata, responsive candidates, loaded and declared font faces, bounded content hashes |
| Screenshots | Implemented | Settled viewport, full-page, stabilized, state, and deterministic scroll PNG evidence |
| Accessibility | Implemented | Full Chromium AX tree with direct linkage back to capture node IDs |
| Interaction and scroll | Implemented core | Non-activating hover/focus states, deltas, restoration; deterministic scroll and fixed/sticky activation |
| Motion | Implemented | CSS declarations, WAAPI runtime instances, timing, easing, keyframes, play state and compositor hints |
| Network and runtime | Implemented | Sanitized request ledger, status/MIME/timing, static-resource hashes, console/page errors, navigation/paint/CLS/long tasks |
| Privacy, policy, integrity | Implemented | Package-wide URL/form/diagnostic redaction, explicit policy record, SHA-256 binding, offline and referential verification |
| Quality | Implemented | Versioned weighted formula 0.2.0 with per-viewport and aggregate metrics |

## Deterministic L2 derivatives included

- logical-element matching across viewports
- responsive hide/show, move, resize, reorder and layout-mode transformations
- alignment groups, repeated spacing scale and probable column grid
- normalized color-usage and motion summaries

Every derivative is stored separately from L0/L1 evidence and records method, confidence, or both.

## Explicitly bounded extensions

The following are not missing canonical-MVP slices. They are optional, environment-specific, or belong to later DIG specifications:

- checked, expanded, invalid, loading, modal-open and transactional states require site-specific safe-action policies;
- closed shadow roots and cross-origin frame internals remain restricted when browser or origin policy blocks access;
- glyph-level typography, canvas command streams, representative motion video and clipped element screenshots are optional extended evidence;
- multi-host logical Site grouping, authenticated/private capture and robots/terms decisions require corpus governance rather than crawler inference;
- semantic sections/components, aesthetic language and brand expression belong to DIG-002/DIG-004;
- production graph/vector/object storage, MCP retrieval and layout generation belong to DIG-006 through DIG-008;
- Firefox/WebKit comparison is a future multi-engine extension; the accepted MVP runtime is Chromium.

## Verification commands

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run capture -- https://example.com
npm run verify -- captures/<capture-package>
```
