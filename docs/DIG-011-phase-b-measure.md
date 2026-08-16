# DIG-011 Phase B — Measure transitions

**Parent:** [DIG-011 User Flow Graph](DIG-011-user-flow-graph.md)  
**Status:** Draft v0.1 — **Phase B runtime shipped** (B1/B2/B3-refuse/B4); live B3 click worker deferred  
**Schema:** [`schemas/flow-edges.schema.json`](../schemas/flow-edges.schema.json)  
**Artifact paths:** `derived/flow-edges.json` + `.jsonl`; per-run `derived/flow-edges.local.jsonl`  
**Code:** `src/flow-edges.ts` · knowledge: [`knowledge/dig-011-phase-b.md`](../knowledge/dig-011-phase-b.md)

## Goal

Produce **L1/L2 FlowTransition edges** between FlowScreens (CaptureRuns) with provenance and optional hotspot geometry.

## Modes

| Mode | Id | Description | Cross-product |
|------|-----|-------------|----------------|
| Href-join | `B1` | Normalize candidate href → match existing CaptureRun URL in AppScope | Pure DIG |
| Seeded walk | `B2` | Ordered URL seed list → consecutive edges (+ optional href proof) | Seeds from **CHECKION** domain crawl or **AUDION** step list |
| Safe activate | `B3` | Budgeted allowlisted click/nav → new CaptureRun + measured hotspot | DIG-001 §42 safety |
| External import | `B4` | Ingest foreign flow JSON as edges `trigger.kind=external_import` | AUDION export / manual |

## Normative rules

1. Every edge MUST name `from_capture_run_id` and `to_capture_run_id` (or equivalent FlowScreen ids once assigned).
2. `activation` MUST be one of: `none` | `observed` | `inferred_href_only`.
3. `inferred_href_only` (B1) confidence MUST be &lt; 1.
4. B3 MUST refuse candidates with `safety: forbid` and MUST record restoration / failure.
5. B2 consecutive seeds MAY create edges without href proof; `method` MUST be `seed_sequence` and confidence capped (e.g. ≤ 0.85) unless href also matches.
6. URL normalization for joins: lowercase host, strip default ports, strip trailing slash except `/`, drop hash for join key (hash retained on trigger evidence).
7. CHECKION domain crawl results are **URL seeds only** — DIG still runs DIG-001 capture per URL for design evidence.
8. Edges MUST NOT store credentials or raw cookies.

## Seed bridge contracts (conceptual)

### CHECKION → DIG (B2)

```text
CHECKION domain_scan overview / page index
  → URL[] (same origin / project)
  → DIG FlowSession { seed_source: "checkion_domain_scan", seed_ref }
  → dig-capture each URL
  → emit seed_sequence edges
```

DIG MUST NOT call CHECKION spider internals; only documented APIs/MCP (`domain_scan_*`).

### AUDION → DIG (B2/B4)

```text
AUDION journey step URLs (ordered)
  → FlowSession { seed_source: "audion_journey", seed_ref }
  → capture + edges
```

Live agent remains AUDION; DIG indexes.

## Non-goals

- Full customer-journey map UI  
- Unbounded crawling inside DIG  
- Auto-login / paywall bypass  

## Acceptance (when implemented)

- Two fixture packages with `/` → `/pricing` href-join produce one `inferred_href_only` edge validating against schema.
- B3 tests use a local static fixture only; never hit production sites in CI.
