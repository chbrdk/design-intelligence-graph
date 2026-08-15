# Challenge — open runtime topics under Plexon

**Date:** 2026-08-15  
**Context:** DIG-012/011 specs are Wave-0 complete; CHECKION staging is live at [checkion-v3.projects-a.plygrnd.tech](https://checkion-v3.projects-a.plygrnd.tech/); DIG will be a **Plexon app** ([DIG-013](../docs/DIG-013-plexon-app.md)).

## Verdict

Open DIG runtime items are **not ready to implement as a solo localhost product**. Without Collection-scoped identity, DesignReference MCP and CHECKION attach become a global mess. Platform P0–P2 (DIG-013) **outrank** DIG-012 Wave 1–4 and DIG-011.

## Open topics challenged

### 1. DIG-012 Wave 1 — emit `design-references.jsonl`

| Risk if done first | Mitigation |
|--------------------|------------|
| Orphan references with no `platform_project_id` | Require dig-project / Collection id on emit in live mode; dummy mode allows local-only |
| Re-emit without auth → anyone’s corpus | Gate enrich/index behind session or token when `DIG_FEDERATION_MODE=live` |

**Still valuable early:** implement emit in **dummy mode** for fixtures/CI, but do not advertise as multi-tenant MCP.

### 2. DIG-012 Wave 2 — Library / MCP `dig_reference_*`

| Risk | Mitigation |
|------|------------|
| Unauthenticated MCP on :8787 | Live MCP requires Bearer; list/get filtered by caller’s Collections |
| Collides with CHECKION MCP mentally | Prefix stays `dig_*`; CHECKION stays `checkion_v3.*` |

**Priority after** P2 auth + binding.

### 3. Wave 3 Prompt-pack assembler / Wave 4 look_conditioned

Specs are solid. Runtime is low risk **technically**, but **product-useless** without a Collection-scoped reference corpus. Keep deferred until Wave 1–2 under tenancy.

### 4. `eval:design-reference` runner

Can run offline on fixtures anytime — **do this early** (no Plexon needed). Good CI gate.

### 5. DIG-011 Flow runtime + Flows UI

Still lower leverage ([dig-011-challenge](dig-011-challenge.md)). Additionally needs CHECKION **domain** seeds → requires live CHECKION token + Collection checkion binding. **Park** until DIG-012 tenancy works and CHECKION peer jobs are boring.

### 6. CHECKION attach as used today

Current DIG can call local CHECKION or staging with API token. Staging UI Sign-in ([CHECKION](https://checkion-v3.projects-a.plygrnd.tech/)) does **not** block token API if token issued in Settings after login. Challenge: document that operators create tokens in CHECKION while Plexon-authed; DIG stores token in env/secret — never user password.

### 7. Stack mismatch (Vite vs Next island)

Biggest delivery risk for “DIG = Plexon app.” Implementing more Vite panels for Flows/References **cements the wrong shell**. Prefer: auth+binding spike on a thin Next island **or** explicit interim BFF — decide before large UI.

### 8. Plexon catalog / bindings (external)

DIG cannot “finish” platform alone. Without plexon-v3 accepting product `dig`, Collection home won’t launch DIG. Track as **blocker** for staging launch, not for local DIG-012 dummy emit.

## Recommended order (revised)

```text
1. DIG-013 P0 paths/docs                          ✅
2. Offline eval runner for design-reference fixtures   ✅
3. DIG-012 Wave 1 emit in dummy mode + tests           ✅
4. plexon-v3: dig binding + catalog stubs              ✅
5. DIG P2: Collection-scoped projects + live MCP gate   ✅ projects durable + capture scope; MCP gate still Wave 2
6. DIG-012 Wave 2 Collection-scoped MCP/Library         ✅ library + dig_reference_* (+ live platformProjectId gate)
7. Live CHECKION peer (staging URL + token) hardened    ⚠️ URL+flag on dig-api; **token still missing**
8. Wave 3–4 prompt / look_conditioned                   ✅ see knowledge/dig-012-wave3-4.md
9. DIG-011 only if multi-screen briefs demand it
```

## Anti-patterns

- Shipping DesignReference search globally before tenancy  
- Building Flows Interactive UI next because specs exist  
- Driving CHECKION via browser automation against Sign-in  
- Second IdP for DIG  
- Treating DIG CLI packages as the multi-tenant SoT  

## Links

- [DIG-013](../docs/DIG-013-plexon-app.md)  
- [dig-plexon-platform](dig-plexon-platform.md)  
- [DIG-012 status](../docs/DIG-012-implementation-status.md)  
- [CHECKION staging](https://checkion-v3.projects-a.plygrnd.tech/)  
- [Plexon staging](https://plexon-v3.projects-a.plygrnd.tech)  
