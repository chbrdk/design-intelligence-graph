# DIG-003 — Geometry & Layout Model

**Status:** Draft v0.1 — implemented  
**Layer:** L2 (deterministic derivation)  
**Upstream:** DIG-001 Capture, DIG-002 Ontology  
**Downstream:** DIG-004 Visual Language, DIG-005 Analysis, DIG-006 Storage, DIG-008 Generation

## Purpose

DIG-003 turns measured geometry and computed layout values into a reproducible layout model. It describes where rendered elements are, how siblings relate in space, which containers establish flex or grid layout, which alignment and spacing values repeat, and how matched logical elements change between canonical viewport widths.

It does not infer visual intent, component semantics, design quality, or an ideal generated layout. Those concerns belong to DIG-002, DIG-004, DIG-005, and DIG-008.

## Inputs and truth boundaries

The model consumes DIG-001 L1 boxes, DOM parentage, viewport/document dimensions, and computed style properties plus DIG-001 L2 logical-element matches and responsive transformations. Its outputs are L2 only: every result is a deterministic calculation from retained evidence.

## Artifacts

Every successful capture package MUST contain the following manifest-bound artifacts:

- `derived/geometry-layout.json` — per-viewport layout model.
- `derived/responsive-layout-graph.json` — logical elements and ordered responsive transformation edges.

The per-viewport model contains a canvas, alignment groups, repeated spacing values, a conservative probable grid, explicit flex/grid containers, and sibling-level spatial relationships. The graph represents an adjacent-width transition for each affected logical element.

## Coordinate model

All source coordinates are document-relative CSS pixels from the measured geometry record. Canvas dimensions retain both viewport and document extent. Geometry already records normalized viewport and document boxes in DIG-001; DIG-003 does not replace that evidence.

## Layout containers

A visible element with visible measured element children is emitted as a layout container when its computed display includes `flex` or `grid`.

- Flex containers retain direction and declared gap.
- Grid containers retain deterministic token counts for declared template columns and rows, plus declared gap.
- Token counts are descriptive, not a claim about realized track geometry; `repeat()` and `minmax()` remain CSS expressions rather than expanded tracks.

## Spatial relationships

Relationships are calculated only among visible measured siblings, so their scope is explicit and bounded.

| Relationship | Deterministic condition |
|---|---|
| `left_of` | vertical projections overlap and horizontal boxes do not |
| `above` | horizontal projections overlap and vertical boxes do not |
| `overlaps` | both projections overlap with positive area |
| `aligned` | members of an existing 2px-tolerance edge/center cluster |

Each relationship records source nodes, measured gap or overlap evidence, confidence `1`, and L2 provenance. They are directional except `aligned`, whose canonical ordering is deterministic.

## Alignment, spacing, and probable grids

The established layout analysis is carried into this model unchanged: edge and center alignment groups use a 2px tolerance; repeated sibling gaps are bounded at 512px and emitted only after two observations; a probable grid requires at least two repeated left-edge clusters. A probable grid remains a conservative L2 hypothesis, never a semantic component classification.

## Responsive layout graph

Graph nodes are DIG-001 logical element IDs. Edges use the existing adjacent-width transformations in ascending viewport-width order: `show`, `hide`, `resize`, `move`, `reorder`, and `layout_mode_change`. An edge stores its exact widths, viewport names, evidence, and confidence. Missing matches produce no edge; DIG-003 never fabricates identity across viewports.

## Validation and versioning

`geometry-layout.schema.json` defines the artifact shape. Package verification MUST reject unknown geometry-model versions, missing viewport/node references, duplicate spatial relationship IDs, duplicate graph edge IDs, or graph edges that do not resolve to both a known logical element and known viewport names.

Geometry-model version `0.1.0` is independent from capture manifest versioning. Breaking changes to derived record meaning increment its major version.
