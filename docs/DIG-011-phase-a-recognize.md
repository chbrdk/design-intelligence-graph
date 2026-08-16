# DIG-011 Phase A — Recognize flow candidates

**Parent:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Status:** Draft v0.1 — **Phase A runtime shipped**; phases B–D specified, not implemented  
**Artifact path:** `derived/flow-candidates.json` (`paths.json` → `flowCandidates`)  
**Code:** `src/flow-candidates.ts` · knowledge: [`knowledge/dig-011-phase-a.md`](../knowledge/dig-011-phase-a.md)

## Goal

From a **single** DIG-001 package, list plausible transition origins without navigating.

## Inputs (read-only)

- Viewport DOM nodes + attributes (`href`, `role`, `type`, `aria-*`)
- Geometry / visibility (`rendered`, in-viewport)
- Ontology entities (buttons, links, nav, forms) when present
- Accessibility names when present

## Outputs

`derived/flow-candidates.json` conforming to the schema:

- `candidate_id`, `node_id`, `viewport_capture_id`
- `control_kind`: `link` | `button` | `nav_item` | `tab` | `submit` | `other`
- `destination`: sanitized URL or null + `destination_class`
- `destination_class`: `internal_same_origin` | `internal_path` | `external` | `fragment` | `action_unsafe` | `unknown`
- `candidacy_score` (0–1, L2 heuristic)
- `hotspot_box` optional measured box (document space preferred)
- `safety`: `allow_activate` | `href_join_only` | `forbid`
- `evidence[]` short facts

## Normative rules

1. Phase A MUST NOT click, submit, or change navigation state.
2. Password, logout, purchase, mailto, tel, download, and known destructive patterns MUST be `action_unsafe` / `forbid`.
3. Candidates SHOULD prefer main landmark / primary CTA heuristics for higher scores; footer cookie links SHOULD score low.
4. Fragment-only destinations (`#section`) MAY be candidates with `destination_class: fragment` (same-page; not a FlowScreen by default).
5. Output MUST be deterministic given the same package (stable sort: score desc, then node_id).

## Non-goals

- Building edges or flows  
- LLM classification  
- Multi-URL corpus  

## Acceptance (when implemented)

- Unit fixture from `examples/fixture` yields ≥1 internal link candidate with `href_join_only` or `allow_activate`.
- Schema validation passes; no network I/O.
