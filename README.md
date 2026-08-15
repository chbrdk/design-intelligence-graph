# Design Intelligence Graph (DIG)

DIG is a spec-driven system for capturing, measuring, interpreting, indexing, and retrieving web-design patterns for use by design agents.

The core pipeline is:

```text
Web → Capture → Measurement → Derivation → Multimodal analysis
    → Design knowledge graph → MCP → Layout specification → Renderer
```

## Status

DIG-001 through DIG-009 are available as implemented Draft v0.1 specifications.

## Capture MVP

Requirements: Node.js 20 or newer and a Chromium browser installed for Playwright.

```bash
npm install
npx playwright install chromium
npm run capture -- https://example.com
npm run verify -- captures/<capture-package>
```

The command captures the required `390 × 844`, `768 × 1024`, and `1440 × 1000` viewports and writes an immutable run directory below `captures/`. Use `--help` to see environment and output options.

Every viewport package contains:

- source and rendered HTML
- DOM nodes with capture-local IDs, source anchors, and structural paths
- element geometry and text line boxes
- the canonical computed-style subset
- accessible CSSOM sources, conditional rules, and custom properties
- accessibility-tree evidence
- image, SVG, video, and font metadata
- sanitized network requests plus console, page-error, and failed-request evidence
- bounded SHA-256 response hashes for static CSS, scripts, images, and fonts without retaining their bytes
- package-wide URL, password-field, and diagnostic redaction before persistence
- settled, full-page, and animation-stabilized PNG screenshots
- safe hover/focus state captures with deltas, screenshots, and restoration outcome
- deterministic scroll samples with fixed/sticky activation and restoration evidence
- CSS/Web Animations motion timing, easing, keyframes, play state, and compositor hints
- synthetic pseudo-element/background evidence and explicit frame hierarchy
- text language/direction/truncation metadata, responsive asset candidates, canvas surfaces, and declared font faces
- navigation timing, paint entries, layout shifts, long tasks, and explicit capture-policy dimensions
- matched CSS cascade evidence and normalized sRGB color-usage summaries
- L2 logical-element matches across viewports with method and confidence

`manifest.json` links every artifact by relative path, byte size, media type, and SHA-256 hash. `quality.json` reports completeness and warnings. Capture evidence remains L0/L1; deterministic cross-viewport matching is emitted separately as L2. Semantic classifications are outside this MVP's scope.

Quality formula `0.2.0` scores each viewport across subsystem success, geometry, styles, screenshots, accessibility, assets, fonts, network completion, state restoration, and scroll restoration. The aggregate is a weighted mean with every metric and weight retained in `quality.json`.

`dig-verify` checks a package without network access. It rejects path traversal, missing or duplicate artifacts, byte-size and hash mismatches, malformed JSON/JSONL evidence, unsupported schema versions, and invalid run identities.

`derived/logical-elements.json` is the first deliberately separated L2 artifact. It connects matching elements across viewports using stable anchors first and structural evidence as a fallback. Every match records its method and confidence; unmatched elements remain unmatched.

`derived/responsive-transformations.json` compares adjacent viewport widths and records material visibility, size, position, order, and layout-mode changes. Geometry comparisons use normalized coordinates and versioned thresholds, while every emitted transformation retains its measured before/after evidence.

`derived/layout-analysis.json` clusters measured edges into alignment groups, extracts repeated sibling gaps as a spacing scale, and proposes column starts only when repeated geometric evidence supports them. These are L2 hypotheses with method and confidence, never raw truth.

### Development

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

### Web UI

A slim React UI accepts a URL and streams detection/ingestion status (`capture → analyze → verify → index`).

```bash
npm run web:install
npm run web:build
npm run llm:serve      # local Gemma 4 via mlx-vlm on :11434 (see knowledge/gemma-llm.md)
npm run serve          # API + static UI on port 8787
```

On OrbStack: start Gemma on the host (`npm run llm:serve`), then `docker compose up --build web` and open `http://127.0.0.1:8787`.

### OrbStack / Docker

The container image pins the Playwright runtime to the version in `package-lock.json` and includes its matching Chromium build. This is the recommended reproducible runtime on OrbStack; captures are written to the host's ignored `captures/` directory rather than into the image. Runtime paths and image tags live in [`knowledge/paths.json`](knowledge/paths.json); ops notes in [`knowledge/orbstack.md`](knowledge/orbstack.md).

```bash
# Build the image and run the full verification suite.
docker compose build
npm run test:docker
# equivalent: typecheck + unit + e2e via `docker compose run --rm dig …`

# Slim web UI + job API
docker compose up --build web

# Capture a site; generated packages appear in ./captures on the host.
docker compose run --rm dig npm run capture -- -o /data/captures https://example.com

# Verify a capture package generated by the previous command.
docker compose run --rm dig npm run verify -- /data/captures/<capture-package>
```

For a capture target that runs directly on the Mac, use OrbStack's host name from inside the container, for example `http://host.docker.internal:4173`.

For a deterministic local smoke test, serve `examples/fixture/` and capture its URL:

```bash
python3 -m http.server 4173 --directory examples/fixture
npm run capture -- http://127.0.0.1:4173
```

## Repository structure

```text
.
├── README.md
├── architecture/       Architecture decision records and diagrams
├── docs/               Normative and supporting specifications
├── examples/           Example captures and fixtures
├── knowledge/          Runtime paths and ops notes
├── schemas/            Machine-readable JSON Schemas
├── src/                TypeScript capture CLI, job API, and instrumentation
├── test/               Automated tests
└── web/                Slim Vite/React capture UI
```

See [docs/INDEX.md](docs/INDEX.md) for the specification roadmap and [docs/DIG-001-capture-spec.md](docs/DIG-001-capture-spec.md) for the capture specification.

See [docs/DIG-001-implementation-status.md](docs/DIG-001-implementation-status.md) for the normative gap audit and the boundary between the completed Capture MVP and later DIG specifications.

See [docs/DIG-002-design-ontology.md](docs/DIG-002-design-ontology.md) and [docs/DIG-002-implementation-status.md](docs/DIG-002-implementation-status.md) for the ontology contract, vocabulary, classification layers, and completion audit.

See [docs/DIG-003-geometry-layout-model.md](docs/DIG-003-geometry-layout-model.md) and [docs/DIG-003-implementation-status.md](docs/DIG-003-implementation-status.md) for deterministic layout containers, spatial relationships, and responsive layout graphs.

See [docs/DIG-004-visual-language-model.md](docs/DIG-004-visual-language-model.md) and [docs/DIG-004-implementation-status.md](docs/DIG-004-implementation-status.md) for measured visual tokens and bounded visual-language hypotheses.

See [docs/DIG-005-analysis-pipeline.md](docs/DIG-005-analysis-pipeline.md) and [docs/DIG-005-implementation-status.md](docs/DIG-005-implementation-status.md) for the analysis stage ledger, provenance, deterministic findings, and quality gate.

Build a portable graph index with `npm run index -- <capture-package>`. See [docs/DIG-006-storage-knowledge-graph.md](docs/DIG-006-storage-knowledge-graph.md).

Serve an index to MCP clients with `npm run mcp -- <graph.json>`. See [docs/DIG-007-mcp-api.md](docs/DIG-007-mcp-api.md).

Generate an evidence-linked layout specification with `npm run generate -- <graph.json>`. See [docs/DIG-008-layout-generation.md](docs/DIG-008-layout-generation.md).

## Versioning

- Specifications use stable identifiers (`DIG-001`, …) and an internal draft version.
- Breaking schema changes increment the schema major version.
- Capture runs are immutable and record crawler, browser, schema, and environment versions.
- Normative terms `MUST`, `SHOULD`, and `MAY` follow RFC-style meanings defined in DIG-001.

## Contributing

Proposed changes should identify the affected spec, preserve the distinction between raw, measured, derived, and semantic truth, and include examples or schema changes where applicable.
