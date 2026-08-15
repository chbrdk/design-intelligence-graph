# Changelog

- DIG-011 Draft v0.1 spezifiziert (spec-only): User Flow Graph Phasen A–D, ADR-011, JSON Schemas, flow_actions-Katalog, CHECKION/AUDION Seed-Bridges — Runtime bewusst deferred.
- DIG-011 Fixture-Validierung: Golden Scenarios unter `fixtures/flows/`, Ajv-Schema-Checks und Graph-Invarianten (`flow-schema-validate`).
- DIG-011 Library/Interactive/MCP-Contracts: Response-Schemas, API-Fixtures, reine Projector-Hilfen, Draft-SQL `009` (nicht applied).
- DIG-011 Flows-UI IA: Library-Tab Screens/Sections/Flows, Interactive Mode, Copy-Trennung zu page_flow.
- DIG-012 Design Reference Bundle (spec-only): Retrieval-Unit für LLM/DIG-008; Fixtures + Schemas; Priorität vor Flow-Runtime.
- DIG-012 Spec-Details: Prompt-Pack, look_conditioned Mapping, Embeddings, Design-Quality-Eval (+ Spec-Helfer/Tests).

- DIG-008 vollständig umgesetzt: deterministische, evidenzverknüpfte Layout-Spezifikation mit Taxonomieblöcken, Breakpoints und Token-Slots.

- DIG-007 vollständig umgesetzt: read-only MCP-stdio-API für Suche, Inspektion, Nachbarschaft, Vergleich und deterministische Empfehlungen.

- DIG-006 vollständig umgesetzt: verifizierter, portabler Knowledge-Graph-Index mit Knoten, Kanten, Linienführung und lokalem Suchzugriff.

- DIG-005 vollständig umgesetzt: versionierter Analysebericht mit expliziten Stage-Status, L2-Aggregaten, L3-Linienführung und Qualitäts-Gate.

- DIG-004 vollständig umgesetzt: versioniertes Visual-Language-Modell für Typografie, Farbe, Form, Bildmaterial, Komposition und Motion mit nachvollziehbaren L3-Hypothesen.

- DIG-003 vollständig umgesetzt: versioniertes Geometrie-/Layoutmodell mit Flex- und Grid-Containern, räumlichen Geschwisterbeziehungen, Layout-Analyse und responsivem Transformationsgraphen.

- DIG-002 vollständig umgesetzt: versionierte Design-Ontologie mit 45 Taxonomiebegriffen, deterministischer und heuristischer Klassifikation, Evidenz/Provenienz, Beziehungen, viewportübergreifender Identität, JSON-Schema und Verifikation.

All notable changes to the DIG specification repository are documented here.

## 0.1.0 — 2026-08-14

- Added the initial repository structure.
- Added DIG-001 Capture Specification, Draft v0.1.
- Added the DIG-001 through DIG-008 specification roadmap.
- Added a runnable TypeScript and Playwright Capture MVP.
- Added canonical mobile, tablet, and desktop viewport capture.
- Added DOM, geometry, computed-style, text-line, accessibility, asset, font, runtime, and screenshot evidence.
- Added content hashes, quality reporting, a manifest JSON Schema, a local fixture, and automated tests.
- Added L2 logical-element matching across viewports with confidence, provenance, and hashed fingerprints.
- Added DIG-003-oriented responsive transformation derivation for visibility, size, position, order, and layout-mode changes.
- Added CSSOM source capture, custom-property evidence, and a sanitized resource-request ledger.
- Added manifest-bound quality reports and the offline `dig-verify` integrity checker.
- Added safe, non-activating hover and focus captures for visible interactive elements.
- Added deterministic scroll sampling and fixed/sticky activation evidence with restoration.
- Added CSS and Web Animations API motion evidence with timing, easing, keyframes, and compositor-friendly classification.
- Added synthetic pseudo-element and background-image records plus frame hierarchy, geometry, and access status.
- Added privacy-bounded SHA-256 response hashing for static network resources.
- Added package-wide sanitization for stored URLs, password fields, HTML attributes, and runtime diagnostics.
- Replaced the coarse quality score with a versioned, weighted multi-subsystem formula and per-viewport metrics.
- Added full box-model evidence, normalized geometry, layout context, alignment clustering, spacing-scale extraction, and probable-grid derivation.
- Added DOM-to-accessibility linkage, node/geometry schemas, and cross-artifact referential verification.
- Added an automated browser end-to-end test covering capture, derivation, privacy, quality, and verification.
- Added richer text and asset metadata, declared font faces, runtime performance evidence, and stable Site/Page/policy identities.
- Added matched CSS cascade evidence and deterministic normalized sRGB color-usage analysis.
