# ADR-001 — Chromium and Playwright Capture Runtime

**Status:** Accepted for MVP  
**Date:** 2026-08-14

## Context

DIG-001 requires reproducible browser conditions, DOM and CSS inspection, screenshots, accessibility evidence, and explicit partial-failure reporting. The first implementation needs one well-defined engine before cross-browser variance is introduced.

## Decision

The Capture MVP uses Playwright with Chromium and creates a fresh browser context per canonical viewport. It records the browser version, user agent, locale, timezone, color scheme, motion preference, viewport, and device scale factor.

In-page instrumentation records rendered DOM evidence, computed design properties, geometry, text lines, and asset metadata. Chromium DevTools Protocol provides the accessibility tree. Screenshots and large evidence remain files; the manifest links them using SHA-256 integrity metadata.

The runtime emits successful viewport results independently. A failed viewport does not discard evidence from other viewports, and the aggregate run becomes `partial` when at least one viewport succeeds.

## Consequences

- The MVP has deterministic, testable semantics on one browser engine.
- Firefox and WebKit differences are not yet represented.
- CDP accessibility capture is Chromium-specific and must be abstracted before adding engines.
- Browser-context isolation favors reproducibility over preserving application state between viewports.
