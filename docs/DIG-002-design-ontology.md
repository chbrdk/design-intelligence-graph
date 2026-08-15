# DIG-002 — Design Ontology

**Project:** Design Intelligence Graph  
**Document:** DIG-002  
**Status:** Draft v0.1 — implemented  
**Purpose:** Normative vocabulary and classification contract for page, region, section, component, element, content, and UX-pattern entities  
**Dependencies:** DIG-001 Capture  
**Downstream:** DIG-003 Geometry, DIG-004 Visual Language, DIG-005 Analysis, DIG-006 Storage, DIG-007 MCP, DIG-008 Generation

---

## 1. Purpose

DIG-002 converts captured interface evidence into a versioned design ontology without collapsing measured truth into semantic opinion. It defines what kinds of design entities exist, how they relate, how classifications cite evidence, and how uncertainty is represented.

DIG-002 answers:

- what semantic role does an observed node or group play?
- which entities contain or implement other entities?
- which classifications are deterministic and which are heuristic?
- how is the same semantic entity connected across viewports?
- which vocabulary version produced a classification?

## 2. Truth-layer contract

DIG-002 consumes DIG-001 L0/L1 evidence and produces:

- **L2 deterministic ontology facts:** direct mappings from explicit HTML/ARIA semantics or deterministic relationships;
- **L3 semantic interpretations:** probable page types and UX patterns inferred from multiple observations.

An L3 result MUST include a method and confidence below 1. An L2 mapping MAY use confidence 1 only when the source semantics are explicit and unambiguous.

## 3. Entity model

```text
Page
├── Region
│   ├── Section
│   │   ├── Component
│   │   │   ├── Element
│   │   │   └── Content
│   │   └── UX Pattern
│   └── Component
└── UX Pattern
```

Containment is evidence-based and need not be perfectly tree-shaped in future graph storage. The canonical artifact uses one primary `parent_entity_id`; additional semantic relationships use explicit relationship records.

## 4. Entity types

### 4.1 Page

A Page describes the semantic purpose of one Page observation. Initial terms are `unknown`, `content`, and `landing`. Page type is an interpretation, not a URL-route assertion.

### 4.2 Region

A Region is a large semantic landmark. Initial terms map to HTML/ARIA landmarks: banner, navigation, main, complementary, and content information.

### 4.3 Section

A Section is a thematic grouping inside a page or region. The initial vocabulary distinguishes generic sections and articles. A section is not inferred merely from every `div`.

### 4.4 Component

A Component is a reusable or functionally coherent interface unit. Initial terms cover navigation, forms, form controls, buttons, links, media, and embedded content.

### 4.5 Element

An Element is a lower-level rendered construct that matters to design reasoning but does not independently form a component. The initial catalog includes generic containers and decorative synthetic elements.

### 4.6 Content

Content classifies communicative material independently from its component wrapper. Initial terms include heading, body text, and label.

### 4.7 UX Pattern

A UX Pattern is a recurring interaction or composition solution. Initial terms include hero, primary action, sticky header, navigation, form, and embedded content.

## 5. Stable taxonomy identifiers

Every term MUST use a stable identifier:

```text
dig:<entity-family>.<term>
```

Identifiers MUST NOT be silently repurposed. Renaming a label does not change identity; changing meaning requires a new identifier or ontology major version.

The machine-readable catalog is emitted at `ontology/catalog.json` and its source is `src/taxonomy.ts`.

## 6. Ontology entity record

Every entity contains:

```json
{
  "ontology_entity_id": "ont_...",
  "entity_type": "component",
  "taxonomy_id": "dig:component.form",
  "viewport_capture_id": "vpc_...",
  "source_node_id": "node_...",
  "logical_element_id": "lel_...",
  "parent_entity_id": "ont_...",
  "confidence": 0.99,
  "method": "form_element",
  "layer": "L2",
  "evidence": [],
  "attributes": {}
}
```

`source_node_id` is null only for page-level entities. `logical_element_id` is optional because DIG-001 deliberately prefers no cross-viewport match over a false match.

## 7. Evidence

Evidence entries use one of `dom`, `geometry`, `style`, or `relationship`. Each entry names a fact and retains the observed value. Evidence MUST be sufficient to explain the classification without consulting model chain-of-thought.

## 8. Relationships

The initial relationship vocabulary is:

- `contains`: structural primary containment;
- `implements`: a component implements a UX pattern;
- `labels`: content labels a control or component.

Every relationship has stable identity, endpoints, confidence, and truth layer. Endpoints MUST resolve inside the same ontology artifact unless a future schema explicitly permits external graph references.

## 9. Deterministic classification rules

The initial implementation maps:

- HTML/ARIA landmarks to Regions;
- `section` and `article` to Sections;
- form and interactive semantics to Components;
- media and iframe semantics to Components;
- headings, paragraphs, and labels to Content;
- sticky headers, navigation, forms, and embeds to deterministic UX Patterns.

These mappings are L2 because the method is deterministic, even though the resulting term is semantic.

## 10. Heuristic rules

The initial L3 heuristics are:

- a visible top section containing an `h1` is a probable Hero;
- an interactive descendant of a Hero is a probable Primary Action;
- a page containing both a Hero and Form is a probable Landing Page;
- otherwise a structured page is a probable Content Page.

Heuristics MUST remain separately identifiable by method and confidence. They MUST NOT overwrite L0/L1 records.

## 11. Hierarchy construction

The primary parent of a node-backed entity is the nearest ancestor node that produced a Region, Section, or Component entity. If none exists, the Page entity is the parent. This creates a reconstructable hierarchy while avoiding classification of arbitrary wrapper elements.

## 12. Multiple classifications

One source node MAY yield multiple ontology entities. For example, `nav` can be a navigation Region, navigation Component, and navigation UX Pattern. These meanings are complementary and MUST NOT be collapsed into one overloaded record.

## 13. Cross-viewport identity

Ontology entities inherit a DIG-001 `logical_element_id` when their source node participates in a reliable cross-viewport match. The ontology MUST preserve viewport-specific entities because semantic role or visibility can change responsively.

## 14. Versioning

The ontology artifact records `ontology_version`. Breaking changes to identifier semantics or required relationships increment the major version. Additive terms increment the minor version. Editorial label changes increment the patch version.

## 15. Validation

A valid DIG-002 artifact MUST satisfy:

1. every taxonomy ID exists in the declared catalog;
2. every viewport reference exists in the capture manifest;
3. every source node exists in its viewport;
4. every logical element reference exists in DIG-001 derivatives;
5. every parent and relationship endpoint resolves;
6. entity and relationship IDs are unique;
7. the page root exists and has no parent;
8. confidence is between 0 and 1;
9. L3 classifications declare a non-perfect confidence and explicit method.

`dig-verify` enforces these relational constraints in addition to hashes and serialized schemas.

## 16. Privacy and governance

Ontology evidence MUST use the privacy-sanitized DIG-001 records. It MUST NOT reintroduce query values, credentials, private form values, or unrestricted third-party content. Classification vocabulary is descriptive and MUST avoid protected-attribute inference about users.

## 17. Non-goals

DIG-002 does not:

- infer brand personality or aesthetic style;
- define geometric grids or responsive transformations;
- define storage topology, MCP tools, or generation output;
- assert business intent unsupported by interface evidence;
- turn heuristic classifications into canonical raw truth.

## 18. Canonical package artifacts

```text
capture/
├── ontology/
│   └── catalog.json
└── derived/
    └── ontology.json
```

Both artifacts MUST be bound by the DIG-001 manifest and package integrity verifier.
