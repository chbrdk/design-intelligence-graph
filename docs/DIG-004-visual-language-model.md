# DIG-004 — Visual Language Model

**Status:** Draft v0.1 — implemented  
**Layers:** L2 deterministic tokens; bounded L3 hypotheses  
**Upstream:** DIG-001 Capture, DIG-003 Geometry  
**Downstream:** DIG-005 Analysis, DIG-006 Storage, DIG-008 Generation

## Purpose

DIG-004 produces a traceable visual-language representation from measured computed styles, asset metadata, geometry, and motion evidence. It separates reproducible visual tokens from interpretive labels, so a consumer can inspect exactly what was measured before relying on an aesthetic characterization.

## Artifact

Each capture package contains manifest-bound `derived/visual-language.json`. For every successful viewport it provides L2 typography, normalized color palette and property roles, shape tokens, imagery inventory, composition measurements, and motion summary. It also contains bounded L3 hypotheses for visual character and motion personality.

## L2 model

Typography tokens group exact computed family, size, weight, line-height and letter-spacing values. Color palette entries use the existing normalized sRGB analysis and derive roles from the consuming property: foreground, background, border, or vector. Shape inventory groups non-empty border radii, box shadows, and border widths. Imagery counts measured image/media asset types and dimensions where supplied. Composition records visible-node count, document aspect ratio, and the explicitly approximate sum-of-box-area coverage; overlap is intentionally not removed. Motion uses captured CSS and Web Animation evidence without inventing playback behavior.

## L3 hypotheses

`restrained` and `expressive` are intentionally narrow heuristics based on token counts. `static` and `animated` are based on observed motion-record count. Each hypothesis has named method, retained numeric evidence, L3 layer, and confidence strictly below `1`. They are not brand claims, quality scores, or universal aesthetic judgments.

## Boundaries

DIG-004 does not perform screenshot vision, image semantics, OCR, logo recognition, brand attribution, emotional sentiment analysis, or pixel-level composition analysis. Those require a later multimodal analysis layer. Fonts are captured as evidence in DIG-001; the current visual token model uses rendered typography rather than assuming a font inventory is a brand system.

## Validation

`visual-language.schema.json` defines the serialized artifact. `dig-verify` rejects unknown visual-language versions, missing viewport references, duplicate hypothesis IDs, and invalid L3 confidence/method contracts.
