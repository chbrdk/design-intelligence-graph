# DIG-008 — Layout Generation Specification

**Status:** Draft v0.1 — implemented

DIG-008 produces a deterministic, evidence-linked structural layout specification from a DIG-006 graph.

Run `npm run generate -- indexes/<capture-run-id>/graph.json`. The output groups ontology taxonomy records into layout blocks, retains every source graph node ID, emits canonical mobile/tablet/desktop breakpoints and named token slots. It deliberately excludes source text, asset bytes, HTML/CSS rendering and visual imitation. Geometry resolution and renderer selection are future adapters.

`layout-spec.schema.json` defines the portable output. The generation manifest hashes the resulting specification and names the source graph.
