# DIG-001 — Web Design Capture Specification

**Project:** Design Intelligence Graph  
**Document:** DIG-001  
**Status:** Draft v0.1  
**Purpose:** Normative specification for acquiring web-interface evidence before semantic design analysis  
**Downstream specs:** DIG-002 Ontology, DIG-003 Geometry, DIG-004 Visual Language, DIG-005 Analysis Pipeline

---

## 1. Purpose

DIG-001 defines how a web interface is captured in a reproducible, machine-readable form.

The Capture Layer must preserve enough evidence to allow later systems to reconstruct and reason about:

- page structure
- geometry
- responsive behaviour
- typography
- color systems
- spacing systems
- shape language
- imagery
- iconography
- visual hierarchy
- interaction states
- motion
- component relationships
- content hierarchy
- design tokens
- visual language
- brand expression

DIG-001 **must not make high-level aesthetic judgments** such as premium, editorial, playful, corporate, luxurious, or brutalist. Those classifications belong to later analysis layers. The Capture Layer records evidence.

---

## 2. Fundamental Architecture

The pipeline separates four levels of truth.

```text
L0 RAW
├─ HTML, DOM, CSS, screenshots, assets
└─ accessibility tree and browser/runtime information
        ↓
L1 MEASURED
├─ bounding boxes, colors, fonts, distances
└─ line boxes, z-index, opacity, scroll positions
        ↓
L2 DERIVED
├─ alignment groups, probable grids, spacing scales
└─ hierarchy, density, responsive transformations
        ↓
L3 SEMANTIC
└─ premium, playful, editorial, trustworthy, dynamic, visual language
```

DIG-001 primarily produces **L0 and L1**.

---

## 3. Normative terminology

**MUST** means required for a valid canonical capture.  
**SHOULD** means strongly recommended unless technically impossible.  
**MAY** means optional or an extended capture capability.

---

## 4. Primary Entity Hierarchy

```text
Corpus
└── Site
    └── Page
        └── CaptureRun
            └── ViewportCapture
                └── StateCapture
                    └── Frame
                        └── Node
```

---

## 5. Entity Definitions

### 5.1 Site

A Site represents a logical web property and is not necessarily equivalent to one hostname.

```json
{
  "site_id": "site_dkv_de",
  "domain": "dkv.com",
  "scheme": "https",
  "canonical_origin": "https://www.dkv.com"
}
```

`www.example.com`, `shop.example.com`, and `account.example.com` may belong to one logical site.

### 5.2 Page

A Page represents a canonical URL or route.

```json
{
  "page_id": "pg_01JXYZ",
  "site_id": "site_dkv_de",
  "url": "https://www.dkv.com/produkte/zahnversicherung",
  "canonical_url": "https://www.dkv.com/produkte/zahnversicherung",
  "route": "/produkte/zahnversicherung"
}
```

Query parameters SHOULD be normalized unless they materially affect presentation.

---

## 6. Capture Run

A CaptureRun is one complete, immutable observation of a Page. A recrawl creates a new CaptureRun, enabling design evolution, A/B detection, redesign detection, layout changes, and technology changes.

```json
{
  "capture_run_id": "cap_01JXYZ",
  "page_id": "pg_01JXYZ",
  "started_at": "2026-08-14T18:00:00Z",
  "crawler_version": "0.1.0",
  "schema_version": "0.1.0",
  "browser": {},
  "environment": {},
  "status": "complete"
}
```

---

## 7. Browser Environment

Every capture MUST record its browser environment and rendering signals.

```json
{
  "browser": {
    "engine": "chromium",
    "version": "...",
    "user_agent": "...",
    "locale": "en-US",
    "timezone": "Europe/Berlin"
  },
  "environment": {
    "prefers_color_scheme": "light",
    "prefers_reduced_motion": false,
    "forced_colors": false,
    "touch": false,
    "pointer": "fine",
    "hover": true
  }
}
```

OS, architecture, browser flags, installed fonts, geolocation policy, cookie policy, consent state, authentication state, and experiment identifiers SHOULD be recorded when relevant.

---

## 8. Canonical Viewports

The first corpus version SHOULD use a fixed viewport matrix.

Required:

```text
mobile       390 × 844
tablet       768 × 1024
desktop     1440 × 1000
```

Recommended:

```text
mobile-small     360 × 800
mobile-large     430 × 932
tablet-portrait  768 × 1024
tablet-wide     1024 × 768
desktop-small   1280 × 900
desktop         1440 × 1000
desktop-large   1920 × 1080
```

Canonical layout captures SHOULD use `deviceScaleFactor = 1`, keeping geometry aligned with CSS pixels. Extended visual captures MAY use `deviceScaleFactor = 2` to observe retina assets, `srcset` behaviour, and high-resolution imagery.

---

## 9. Viewport Capture

Every viewport is an independent rendering observation.

```json
{
  "viewport_capture_id": "vpc_...",
  "capture_run_id": "cap_...",
  "viewport": {"width": 1440, "height": 1000, "device_scale_factor": 1},
  "document": {"width": 1440, "height": 7280},
  "scrollbar_width": 0
}
```

---

## 10. Page Load Phases

The crawler SHOULD distinguish:

- **Initial:** immediately after primary document render; useful for skeletons, loaders, and initial animations.
- **Settled:** canonical static capture after document completion, font resolution, major visible image loading, and sufficiently low mutation/layout movement.
- **Stabilized:** animations temporarily paused for deterministic geometry inspection.

A strict `networkidle` condition MUST NOT be required because analytics, websockets, long polling, streaming, and trackers may remain active.

---

## 11. Stabilization

The crawler SHOULD monitor DOM mutations, layout changes, image loading, font loading, and scroll-height changes. A practical target is approximately 500 ms of DOM mutation inactivity and layout stability after fonts are ready.

A maximum settle timeout MUST exist; for example, 8 seconds normally and 15 seconds hard maximum. A capture may still succeed partially. Stabilization actions MUST be logged and reversible.

---

## 12. Capture Status

Every subsystem returns one of `complete`, `partial`, `failed`, `not_attempted`, `unsupported`, or `blocked`.

```json
{
  "capture_status": {
    "dom": "complete",
    "css": "complete",
    "visual": "complete",
    "assets": "partial",
    "interaction": "not_attempted"
  }
}
```

Failures MUST include a machine-readable code and SHOULD include diagnostic evidence.

---

## 13. HTML Capture

Original source HTML and rendered DOM HTML MUST be distinguished and stored with content hashes.

```json
{
  "html": {
    "source_ref": "blob://...",
    "rendered_ref": "blob://...",
    "source_hash": "sha256:...",
    "rendered_hash": "sha256:..."
  }
}
```

Large raw payloads SHOULD live in object storage rather than relational records.

---

## 14. DOM Tree Capture

Every rendered element receives a node record containing tag name, namespace, attributes, text references, parent, children, sibling order, shadow DOM membership, and frame membership.

```json
{
  "node_id": "node_01J...",
  "parent_node_id": "node_...",
  "tag": "button",
  "namespace": "html",
  "sibling_index": 3
}
```

---

## 15. Node Identification

Three identifiers serve different purposes:

1. `node_id` is unique and reliable within a capture.
2. `source_anchor` preserves matching evidence such as HTML ID, `data-testid`, ARIA label, name, role, href, and stable attributes.
3. `logical_element_id` attempts to identify the same logical element across viewports and states and MUST carry match confidence and method.

```json
{
  "logical_element_id": "lel_...",
  "match_confidence": 0.94,
  "match_method": "anchor_and_structure"
}
```

A false match is worse than no match.

---

## 16. DOM Path

A structural locator SHOULD be stored, for example `html > body > main > section:nth-of-type(1) > div.hero > h1`. Selectors are evidence, not identity; implementations MUST NOT rely exclusively on CSS selectors.

---

## 17. Shadow DOM

Accessible shadow roots SHOULD be traversed. Records include whether a node is a shadow node, its host, root, and mode. Closed roots that cannot be inspected MUST be marked inaccessible rather than silently omitted.

---

## 18. iframe Handling

Each frame records ID, URL, origin, parent frame, sandbox attributes, geometry, and capture status. Same-origin frame contents SHOULD be captured. Cross-origin content SHOULD be captured when browser instrumentation permits it; otherwise the frame region, screenshot evidence, URL, origin, and restrictions MUST be retained.

---

## 19. Synthetic Nodes

Visible objects without ordinary DOM nodes are represented as synthetic nodes. This includes `::before`, `::after`, background images, canvas surfaces, video surfaces, and browser-generated controls.

```json
{
  "node_type": "pseudo",
  "pseudo_type": "::before",
  "owner_node_id": "node_..."
}
```

---

## 20. Text Capture

Raw text MUST be captured separately from DOM HTML. Visible text records SHOULD include normalized text, detected and declared language, character and word count, line count, visibility, truncation, direction, and writing mode.

---

## 21. Text Geometry

Individual line rectangles MUST be captured for significant visible text, not only the containing element box.

```json
{
  "line_boxes": [
    {"x": 120, "y": 260, "width": 510, "height": 64},
    {"x": 120, "y": 330, "width": 440, "height": 64}
  ]
}
```

This supports line length, rag, headline composition, density, and vertical rhythm analysis. Glyph-level boxes MAY be captured for specialized typography research.

---

## 22. Element Geometry

Every rendered node SHOULD have a document-relative bounding box and, when applicable, viewport-relative coordinates.

```json
{"bbox": {"x": 120, "y": 240, "width": 620, "height": 180}}
```

Multi-fragment inline elements SHOULD preserve all client rectangles. Transforms MUST not be flattened without retaining transform evidence.

---

## 23. Normalized Geometry

Normalized geometry MAY reference viewport, document, parent, or section. The reference MUST be explicit.

```json
{
  "bbox_normalized": {
    "reference": "viewport",
    "x": 0.08333, "y": 0.12, "width": 0.43055, "height": 0.09
  }
}
```

---

## 24. Geometry Precision

Floating-point CSS geometry MUST be retained without premature rounding, for example `127.671875`. Presentation APIs may round derived output later.

---

## 25. Box Model

Significant nodes SHOULD record content, padding, border, and margin boxes, including per-side values and box-sizing. Collapsed margins and scroll dimensions SHOULD be recorded where applicable.

---

## 26. Layout Context

Capture display and layout mode. Flex evidence includes direction, wrap, justification, alignment, gaps, order, growth, shrinkage, and basis. Grid evidence includes templates, areas, auto-flow, gaps, and item placement. Table, multicolumn, ruby, and flow-root contexts SHOULD be preserved when present.

---

## 27. Positioning

Capture static, relative, absolute, fixed, and sticky positioning plus inset values and containing block. Sticky and fixed elements SHOULD additionally be observed during scrolling, including activation thresholds and occupied positions.

---

## 28. Stacking and Visibility

Capture z-index, stacking context, opacity, visibility, display, overflow, clipping, clip paths, and masks. Derive `rendered`, `in_viewport`, and `occluded`; approximate occlusion MUST be labelled as such.

---

## 29. Computed Style Capture

The primary database SHOULD NOT blindly persist every browser CSS property for every node. Instead:

- **Level A:** canonical design-relevant properties are always stored.
- **Level B:** extended computed style MAY be stored as compressed forensic evidence.

Property values SHOULD retain both serialized browser output and normalized typed values where safe.

---

## 30. Canonical Style Property Groups

At minimum, capture relevant properties from these groups:

- **Typography:** family, size, style, weight, stretch, variations, features, line height, spacing, alignment, transform, decoration, wrapping.
- **Color:** text, background, borders, outlines, caret, decoration, SVG fill and stroke.
- **Shape:** radii, borders, outlines, shadows, filters, backdrop filters, clipping, masks.
- **Layout:** display, position, inset, dimensions, constraints, margins, padding, gaps, aspect ratio, overflow.
- **Transform:** transform, origin, perspective, translate, rotate, scale.
- **Interaction:** cursor, pointer events, user selection, touch action, scroll snap.

---

## 31. CSS Sources

The crawler SHOULD capture external stylesheets, inline style blocks, style attributes, CSS custom properties, `@font-face`, `@media`, `@supports`, `@container`, layers, and imports. Each source receives URL/origin, hash, media condition, access status, and order.

---

## 32. CSS Custom Properties

Accessible CSS variables are valuable evidence for design-system detection and SHOULD be captured with name, raw value, computed value, scope node, source, and inheritance. No semantic meaning is assumed at the Capture Layer.

---

## 33. Matched CSS Rules

For important nodes, implementations SHOULD preserve the rules that generated final styles, including selector, stylesheet, declaration, specificity, cascade layer, condition, and whether the declaration won. This permits later distinction between fixed, fluid, inherited, token-based, and breakpoint-dependent values.

---

## 34. Typography and Fonts

Capture declared and resolved font family, loaded face, source URL when available, format, weight, style, stretch, variable axes, font-display, fallback usage, synthesis, and loading status. Font files SHOULD be referenced by hash. Licensing and redistribution constraints MUST be recorded; files MUST NOT be redistributed without rights.

---

## 35. Color Representation

Colors SHOULD be stored as original serialized values and normalized sRGB RGBA. Implementations MAY additionally store linear RGB, OKLCH, and color-space metadata. Gradients MUST retain type, stops, positions, angles or geometry, repetition, and source string. Transparency and compositing context MUST not be discarded.

---

## 36. Images and Visual Assets

For images, SVG, icons, video, and backgrounds capture source URL, selected/current source, intrinsic and rendered dimensions, object-fit/position, crop, MIME type, content hash, loading state, alt text, role, and responsive candidate data. Asset bytes MAY be stored subject to policy and rights. Broken or blocked assets remain explicit records.

SVG SHOULD preserve source when permitted plus viewBox, rendered box, fills, strokes, and referenced resources. Canvas SHOULD preserve screenshots and dimensions; command capture is optional.

---

## 37. Screenshots

Each canonical viewport SHOULD produce:

- a viewport screenshot at the settled phase
- a full-page screenshot or deterministic tiled equivalent
- a stabilized geometry screenshot
- metadata linking pixels to capture, viewport, phase, scroll offset, DPR, and color profile

PNG is RECOMMENDED for canonical lossless evidence. Additional WebP/AVIF derivatives MAY be generated for retrieval. Full-page stitching MUST account for fixed/sticky elements and lazy-loaded content.

---

## 38. Element and Region Screenshots

Significant elements and inferred regions MAY receive clipped screenshots. The clip rectangle, padding, source screenshot, transforms, DPR, and any occluding elements MUST be recorded. Clipped evidence is a derivative and never replaces the full capture.

---

## 39. Accessibility Tree

The accessibility tree SHOULD be captured with role, accessible name, description, value, states, properties, hierarchy, and DOM linkage when available. DOM semantics and accessibility semantics MUST remain distinct. Missing accessibility information is evidence, not permission to infer it at L0/L1.

---

## 40. Links, Controls, and Forms

Capture links, buttons, inputs, selects, textareas, labels, validation state, required state, disabled state, autocomplete, form ownership, targets, and destination types. Sensitive entered values, credentials, personal data, and session secrets MUST NOT be stored. Password fields MUST never be captured as plaintext.

---

## 41. State Capture

The canonical base state is supplemented by controlled states when safe and reversible:

```text
default, hover, focus, focus-visible, active, checked, selected,
expanded, disabled, invalid, loading, open, scrolled, sticky-active
```

Each StateCapture records its trigger, preconditions, actions, timestamp, DOM/style/geometry deltas, screenshot evidence, and restoration result. States MUST be linked to the base state.

---

## 42. Interaction Discovery

Potential interactions can be discovered from semantics, event listeners, focusability, cursor, attributes, navigation targets, and visual affordances. Automated interaction MUST use a safety policy. It MUST avoid purchases, submissions, destructive actions, authentication changes, messages, downloads, and other external side effects unless explicitly authorized in a separate environment.

---

## 43. Scroll Capture

Long pages SHOULD be observed at deterministic scroll positions: top, viewport increments, significant element anchors, sticky thresholds, and bottom. Each sample stores requested and actual offsets, visible nodes, fixed/sticky state, and screenshot. Scroll-driven lazy loading and layout changes SHOULD be allowed to settle before measurement.

---

## 44. Motion Capture

The Capture Layer SHOULD inspect CSS animations and transitions, Web Animations API instances, animated SVG, video, canvas, and scroll-linked motion when accessible. Record property, keyframes, duration, delay, iteration, direction, fill, easing, play state, and trigger.

For representative motions, implementations MAY sample frames or record a short video. Canonical geometry MUST use a documented stabilized time. Reduced-motion variants SHOULD be captured as separate environments.

---

## 45. Responsive Behaviour

Responsive evidence comes from independent canonical viewports, stylesheet conditions, container queries, source selection, and logical-element matching. The Capture Layer records observations; DIG-003 derives transformation types such as stack, reorder, hide, collapse, tabs-to-accordion, and navigation-to-drawer.

Viewport changes MUST begin from a documented clean or preserved state. The strategy MUST be consistent within a corpus.

---

## 46. Network and Runtime Evidence

Capture document and relevant resource requests with URL, method, resource type, status, MIME type, timing, initiator, cache outcome, and content hash when stored. Headers and URLs MUST be sanitized for secrets and personal information.

Runtime evidence SHOULD include console errors, page errors, failed resources, CSP restrictions, long tasks, and layout shifts relevant to capture quality. Analytics payloads and unrelated user data SHOULD NOT be retained.

---

## 47. Content, Consent, and Variants

Locale, market, theme, consent state, authentication state, personalization, feature flags, and experiments can materially change rendering and MUST be represented as capture dimensions when known. Consent dialogs SHOULD be captured as a state before dismissal; any dismissal action and resulting state MUST be recorded.

The system MUST NOT pretend that one observed variant is the universal page.

---

## 48. Provenance

Every field or record SHOULD carry or inherit provenance sufficient to answer:

```text
where did this value come from?
when was it observed?
which tool and version produced it?
was it raw, measured, normalized, or inferred?
what transformation was applied?
```

L0 and L1 values SHOULD have confidence `1` only when directly and reliably observed. Any heuristic included in the capture output MUST be labelled with method and confidence and MUST NOT masquerade as raw evidence.

---

## 49. Privacy, Security, Rights, and Crawl Policy

Implementations MUST respect applicable law, site terms, crawl policy, rate limits, authentication boundaries, and intellectual-property constraints. Captures MUST minimize personal data and secrets. Tokens, cookies, authorization headers, entered credentials, private messages, and unrelated account information MUST be redacted or excluded.

The manifest SHOULD record robots/policy decisions, authorization basis, retention class, redistribution class, and takedown linkage. Structural measurements and derived features SHOULD be separable from restricted original assets.

---

## 50. Storage and Integrity

Raw blobs SHOULD be content-addressed with SHA-256 or stronger hashes. The manifest MUST bind all artifacts to the CaptureRun and schema versions. Implementations SHOULD support compression, deduplication, encryption at rest, retention policy, and integrity verification.

A capture is immutable. Corrections create a new derived artifact or superseding capture; they do not silently mutate historical evidence.

---

## 51. Quality Metrics

A quality report SHOULD cover:

- load and stabilization outcome
- HTML/DOM/CSS accessibility
- font and primary asset completeness
- screenshot completeness and stitching integrity
- geometry coverage of visible nodes
- accessibility-tree linkage
- interaction/state coverage
- runtime errors and blocked frames/resources
- unexpected overlays, consent, authentication, or bot challenges

```json
{
  "quality": {
    "overall": 0.91,
    "geometry_coverage": 0.98,
    "asset_completeness": 0.87,
    "warnings": ["cross_origin_frame_unavailable"]
  }
}
```

The formula and thresholds MUST be versioned. Quality scores never erase underlying warnings.

---

## 52. Canonical Capture Package

A valid package SHOULD have this logical shape:

```text
capture/
├── manifest.json
├── html/
│   ├── source.html
│   └── rendered.html
├── dom/
│   ├── nodes.jsonl
│   └── accessibility.jsonl
├── styles/
│   ├── computed.jsonl
│   ├── variables.jsonl
│   └── stylesheets.json
├── geometry/
│   ├── boxes.jsonl
│   └── text-lines.jsonl
├── screenshots/
├── assets/
├── states/
├── network/
└── quality.json
```

Physical storage MAY differ, but the logical entities and links MUST remain reconstructable.

---

## 53. Minimum Viable Canonical Capture

A capture is minimally canonical only if it contains:

1. immutable run identity, timestamps, versions, and environment
2. canonical URL and viewport
3. rendered DOM with stable capture-local node IDs
4. document and viewport geometry for rendered nodes
5. canonical computed-style subset
6. visible text and text line geometry
7. viewport and full-page visual evidence
8. primary asset and font metadata
9. accessibility evidence or explicit unsupported/blocked status
10. subsystem statuses, provenance, hashes, and quality report

Partial captures remain useful but MUST NOT be labelled canonical-complete.

---

## 54. Determinism and Reproducibility

Exact pixels cannot always be reproduced because remote content, font rasterization, ads, experiments, time, and nondeterministic applications change. DIG therefore requires reproducibility of **conditions and evidence**, not a false promise of universal pixel identity.

Implementations SHOULD freeze or record time, random seeds, locale, timezone, viewport, DPR, theme, motion preference, storage state, and crawler/browser versions. All interventions MUST be recorded.

---

## 55. Non-Goals

DIG-001 does not:

- classify aesthetic style or brand personality
- infer sections, components, or UX-pattern ontology as canonical truth
- compute final grids, spacing scales, or responsive transformations
- define storage-query APIs or MCP tools
- generate layouts or code
- grant permission to copy or redistribute captured works

Those concerns belong to DIG-002 through DIG-008 or external governance.

---

## 56. Implementation Sequence

A practical implementation order is:

1. manifest, browser environment, and viewport matrix
2. rendered HTML, DOM IDs, geometry, and screenshots
3. canonical computed styles, text lines, assets, and fonts
4. accessibility tree, frames, shadow DOM, and pseudo-elements
5. scroll, states, interactions, and motion
6. provenance, quality scoring, privacy controls, and corpus validation

Each stage MUST retain the L0/L1 boundary and remain compatible with later specs.

---

## 57. Open Questions for v0.2

- Which nodes qualify for always-on matched-rule and element-screenshot capture?
- Which browser instrumentation surface is canonical across Chromium versions?
- How should cross-browser captures be represented without multiplying corpus cost excessively?
- Which full-page stitching method best preserves fixed and scroll-linked elements?
- What is the minimum safe interaction policy for public-web capture?
- How are asset rights and redistribution classes encoded consistently?
- Which quality thresholds define `complete` for each subsystem?

---

## 58. Summary

DIG-001 defines a Capture Layer that preserves original evidence and objective measurements before interpretation. It separates raw, measured, derived, and semantic truth; treats every viewport and state as an explicit observation; records provenance and quality; and produces an immutable evidence package suitable for ontology, geometry, visual-language, analysis, storage, MCP, and deterministic layout-generation layers.

The governing principle is:

> Capture first. Measure faithfully. Derive explicitly. Interpret later.
