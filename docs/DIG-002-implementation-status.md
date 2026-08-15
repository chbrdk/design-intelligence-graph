# DIG-002 Implementation Status

**Implementation:** `dig-capture` 0.1.0  
**Ontology:** DIG-002 v0.1.0  
**Assessment date:** 2026-08-14

## Status

DIG-002 Draft v0.1 is fully implemented for the declared ontology scope. The implementation emits a manifest-bound catalog and ontology artifact for every successful capture run.

| Capability | Status | Implementation |
|---|---|---|
| Stable vocabulary | Implemented | 45 versioned `dig:*` taxonomy identifiers in `src/taxonomy.ts` |
| Entity families | Implemented | Page, Region, Section, Component, Element, Content, UX Pattern |
| L2 deterministic rules | Implemented | HTML/ARIA landmarks, sections, forms, controls, links, media, embeds, lists, tables, dialogs, disclosure, tabs, figures, content semantics |
| L3 heuristic rules | Implemented | Hero, primary action, landing/content page, accordion group and card grid |
| Evidence | Implemented | DOM, geometry, style and relationship facts retained per classification |
| Confidence/provenance | Implemented | Explicit method, layer and bounded confidence on every entity |
| Multiple roles per node | Implemented | Complementary Region/Component/Pattern records remain distinct |
| Hierarchy | Implemented | Nearest semantic ancestor with Page fallback |
| Relationships | Implemented | `contains`, `implements`, and explicit/implicit `labels` |
| Responsive identity | Implemented | Entity linkage to DIG-001 Logical Elements when a reliable match exists |
| Artifact schema | Implemented | `schemas/ontology.schema.json` |
| Catalog artifact | Implemented | `ontology/catalog.json`, bound by manifest SHA-256 |
| Ontology artifact | Implemented | `derived/ontology.json`, bound by manifest SHA-256 |
| Referential verification | Implemented | Viewport, node, logical element, parent, taxonomy and relationship endpoint validation |
| Privacy boundary | Implemented | Only sanitized DIG-001 evidence enters ontology records |
| Unit verification | Implemented | Classification, hierarchy, relationships, logical linkage and invalid-reference tests |
| Browser verification | Implemented | Multi-viewport capture creates, links and verifies real ontology artifacts |

## Current vocabulary coverage

- Pages: unknown, content, landing
- Regions: banner, navigation, main, complementary, content information
- Sections: generic section, article
- Components: navigation, form, form control, button, link, media, embed, list, list item, table, dialog, disclosure, tabs, search, figure
- Elements: container, decorative
- Content: heading, body text, label, caption, quote, code
- UX patterns: hero, primary action, sticky header, navigation, form, embedded content, accordion, tabs, modal, search, breadcrumb, card grid

## Explicit boundaries

These are downstream concerns rather than incomplete DIG-002 slices:

- geometry quality, grids and responsive transformations are DIG-003;
- visual style, aesthetic language and brand personality are DIG-004;
- probabilistic model orchestration and evaluation datasets are DIG-005;
- graph persistence and cross-corpus identity are DIG-006;
- retrieval APIs and recommendations are DIG-007;
- synthesized layouts are DIG-008.

New domain-specific page/component/pattern terms can be added additively in later ontology minor versions without changing the v0.1 contract.
