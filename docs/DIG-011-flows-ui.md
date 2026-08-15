# DIG-011 — Flows Library UI & Interactive Mode (IA)

**Status:** Draft v0.1 — **specified, not implemented**  
**API:** [DIG-011-library-api.md](DIG-011-library-api.md)  
**Fixtures:** `fixtures/flows/api/` · **Visual tokens:** reuse existing `web/src/styles.css` DIG shell  
**Companion:** [`knowledge/dig-011-flows-ui.md`](../knowledge/dig-011-flows-ui.md)

## 1. Goal

Add a **Flows** surface to the slim DIG web UI so operators can:

1. Browse multi-screen design flows (DIG-011), filtered by `flow_action`
2. Open a flow detail (ordered screens + graph summary)
3. Enter **Interactive Mode** (hotspot playback) using pre-captured media only
4. Keep **page_flow** (within-page section narrative) clearly separate

No live browser automation, no Journey Agent, no CHECKION magazine chrome inside DIG.

## 2. Information architecture

### 2.1 Top-level Library modes

Today’s Library is screen/section-centric. Introduce an explicit mode switch **inside** the Library panel (not a new top-level product):

```text
Library
├── Screens     (existing)
├── Sections    (existing)
└── Flows       (DIG-011)     ← new
```

Analyses / Enrichment / Pipeline panels remain unchanged.

### 2.2 Naming (UI copy)

| UI label | Data | API (planned) |
|----------|------|----------------|
| **Flows** | DIG-011 Flow list/detail/interactive | `/api/library/flows…` |
| **Page narrative** (screen detail) | Existing `page_flow` LLM steps | today’s `/flows` → later `/page-flows` |
| **Section look** | DIG-010 | analyses / screen detail |

Never label `page_flow` as “User flow” in the UI.

### 2.3 Routes / deep links (client hash or query)

Planned client-only navigation (no Next.js router required):

| State | Suggested URL | Loads |
|-------|---------------|--------|
| Flows list | `#/library/flows` | list envelope |
| Flow detail | `#/library/flows/:flow_id` | detail |
| Interactive | `#/library/flows/:flow_id/interactive?step=:screen_id` | interactive payload |
| Screen (existing) | `#/library/screens/:viewport_capture_id` | unchanged |

Until hash routing exists, React state MAY mirror these keys for fixture-driven UI tests.

## 3. Flows list

### Layout (one job)

- **Headline:** Flows  
- **One supporting line:** Multi-screen design journeys indexed from captures  
- **Filters (single row):** `flow_action` select (catalog labels) · optional search `q` · clear  
- **Result:** vertical list or compact grid of flow cards  

### Flow list item (not a marketing card wall)

Each row/item shows:

- Title (or flow_id fallback)  
- Facet chips: `flow_action` labels (from catalog)  
- Meta: `N screens · M edges`  
- Optional preview thumb (first screen `preview_url` / media when available)  

Click → Flow detail.

Empty state: short copy + link to DIG-011 status (“Flows appear after multi-screen index — fixtures available for contract tests”).

### Filters

- `flow_action` options = `knowledge/flow-actions-catalog.json` labels (exclude `dig:flow.unknown` unless debugging)  
- Selecting a chip calls `GET /api/library/flows?flow_action=dig:flow.…`

## 4. Flow detail

### Composition

```text
┌─────────────────────────────────────────────┐
│ Title · flow_action chips · app_scope        │
│ [Open Interactive]                           │
├───────────────┬─────────────────────────────┤
│ Screen strip  │ Graph / edges summary        │
│ (ordered)     │ (from→to, method, hotspot?)  │
└───────────────┴─────────────────────────────┘
│ Optional: CHECKION scan link per screen      │
└─────────────────────────────────────────────┘
```

Rules:

1. Screen strip order = `screens[].order`.  
2. Clicking a screen opens **that capture’s screen detail** when `capture_run_id` is known; does not start Interactive Mode.  
3. Primary CTA is **Open Interactive**.  
4. Edge summary is text/table — not a full graph editor.  
5. If `checkion_scan_id` present, show external link using CHECKION base from `paths.json` (staging/local) — DIG does not embed issues.

## 5. Interactive Mode

### Goal

Mobbin-like walk: one screen at a time, click hotspot → next screen. Media is **pre-captured** only.

### Layout

```text
┌────────────────────────────────────────────┐
│ Flow title          Step i / n    [Exit]   │
├────────────────────────────────────────────┤
│                                            │
│         Full-bleed screen image            │
│         + hotspot overlays (accent)        │
│                                            │
├────────────────────────────────────────────┤
│ Outbound: tip · skip (if branch)           │
│ Keyboard: ← → Esc                          │
└────────────────────────────────────────────┘
```

### Behavior

| Event | Behavior |
|-------|----------|
| Load | `GET …/interactive`; start at `start_screen_id` or `?step=` |
| Click hotspot | Go to `to_screen_id`; update `?step=` |
| Click outside / `advance_anywhere` | Advance along first outbound edge if any |
| Branch (2+ hotspots) | Require explicit hotspot choice (no auto-advance) |
| ← / → | Previous/next along primary path order when unambiguous; else no-op |
| Esc / Exit | Back to Flow detail |

### Hotspot rendering

- Use Interactive payload boxes with `space: "normalized"` (0–1 over displayed image).  
- Accent outline from existing `--accent` (no purple glow / pill clutter).  
- Visible focus ring for keyboard users on hotspot targets.  
- Missing image: placeholder with `primary_url` text — still allow graph strip navigation.

### Non-goals

- Playing CHECKION video  
- Live Playwright click-through  
- Editing hotspots  
- Auto-playing entire flow  

## 6. Motion (2–3 intentional)

Aligned with existing shell (`drift` atmosphere already present):

1. **Step crossfade** — image opacity 160–220ms when changing step  
2. **Hotspot enter** — slight fade-in of overlays after image settle  
3. **Branch hint** — if ≥2 outbound hotspots, brief pulse on overlays once per step enter  

Respect `prefers-reduced-motion: reduce` (instant swap, no pulse).

## 7. Client API surface (planned `web/src/api.ts`)

| Function | Endpoint |
|----------|----------|
| `fetchDesignFlows(params)` | `GET /api/library/flows` |
| `fetchDesignFlow(flowId)` | `GET /api/library/flows/:id` |
| `fetchDesignFlowInteractive(flowId)` | `GET /api/library/flows/:id/interactive` |

Rename today’s `fetchLibraryFlows` → `fetchPageFlows` when API moves to `/page-flows` (compat alias during transition).

Types mirror fixtures in `fixtures/flows/api/`.

## 8. Fixture-driven UI acceptance (spec-era)

Until HTTP exists, UI stories/tests MAY load:

- `fixtures/flows/api/flows.list.json`  
- `fixtures/flows/api/login-href-join.detail.json`  
- `fixtures/flows/api/login-href-join.interactive.json`  
- `fixtures/flows/api/onboarding-branch.interactive.json` (branch hotspots)

Contract tests already validate these payloads. UI implementation MUST consume the same shapes.

## 9. Accessibility

- Hotspots are `<button>` (or role=button) with accessible names from edge label / destination order  
- Screen image has alt from title + step URL  
- Focus order: Exit → hotspots → step controls  
- Color: hotspot outline contrast against dark shell  

## 10. Implementation policy

**Do not build React panels until Phase D list/detail/interactive HTTP exists** (or an explicit UI-mock flag loading fixtures only). This document is the IA contract.

Phased UI build when unblocked:

1. Flows list (fixture or API)  
2. Detail  
3. Interactive Mode  
4. Rename page_flow UI strings + API alias  

## 11. References

- [DIG-011-library-api.md](DIG-011-library-api.md)  
- [knowledge/dig-011-test-scenarios.md](../knowledge/dig-011-test-scenarios.md)  
- [knowledge/frontend.md](../knowledge/frontend.md)  
- [knowledge/dig-checkion-boundary.md](../knowledge/dig-checkion-boundary.md)  
- Mobbin Interactive Mode (product reference only)  
