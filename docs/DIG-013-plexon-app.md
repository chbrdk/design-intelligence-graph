# DIG-013 — DIG as Plexon App (Auth, Connection, CHECKION peer)

**Status:** Draft v0.1 — **specified, not implemented**  
**ADR:** [ADR-013](../architecture/ADR-013-plexon-capability.md)  
**Challenge:** [`knowledge/runtime-open-topics-challenge.md`](../knowledge/runtime-open-topics-challenge.md)  
**Companion:** [`knowledge/dig-plexon-platform.md`](../knowledge/dig-plexon-platform.md)

## 1. Goal

Plan DIG as another **Plexon Collection capability** with:

- Plexon identity (auth)  
- Collection binding (connection)  
- Peer use of **live** CHECKION v3 at [https://checkion-v3.projects-a.plygrnd.tech/](https://checkion-v3.projects-a.plygrnd.tech/)  
- Design intelligence remaining DIG-owned (DIG-012), not a CHECKION feature fork  

## 2. Platform facts (SoT outside DIG)

| Fact | Source |
|------|--------|
| Staging CHECKION | `https://checkion-v3.projects-a.plygrnd.tech` — login via Plexon ([paths](https://github.com/chbrdk/checkion-v3/blob/main/knowledge/paths.md)) |
| Staging Plexon | `https://plexon-v3.projects-a.plygrnd.tech` |
| Staging CHECKION MCP | `https://checkion-v3-mcp.projects-a.plygrnd.tech` |
| Federation contract | `2026-05-plexon-federation-v3` |
| Collection model | One user project; products are capabilities + bindings ([collection-projects](https://github.com/chbrdk/plexon-v3/blob/main/specs/domain/collection-projects.md)) |
| Existing mirrors | `checkion`, `audion`, `brandion`, `creation` |
| Capability catalog owners | today `audion` \| `checkion` \| `brandion` \| `echon` \| `plexon` — **DIG to be added** ([capability-catalog](https://github.com/chbrdk/plexon-v3/blob/main/specs/domain/capability-catalog.md)) |

## 3. Product identity

| Field | Value |
|-------|--------|
| Product id | `dig` |
| Display | Design Intelligence (capability label, never “DIG project type”) |
| Repo | `design-intelligence-graph` (this) |
| Proposed staging host | `https://dig.projects-a.plygrnd.tech` (Coolify; TBD ops) |
| Local default | `http://127.0.0.1:8787` (current) until Next island |

## 4. Auth (normative)

Mirror CHECKION [`plexon-federation.md`](https://github.com/chbrdk/checkion-v3/blob/main/specs/domain/plexon-federation.md):

| Mode | Behavior |
|------|----------|
| **dummy / local** | Optional open bypass when Plexon env unset (dev only) |
| **live** | Session via Plexon `POST /api/auth/validate-credentials`; middleware protects app UI |
| **machine** | Bearer DIG API tokens (Settings); required for MCP/CLI when live |

Env (names in `paths.json` → `plexon` / `checkionV3`):

- `PLEXON_AUTH_URL` / `NEXT_PLEXON_BASE_URL` → `https://plexon-v3.projects-a.plygrnd.tech`  
- `PLEXON_SERVICE_SECRET`, `AUTH_SECRET` (≥32)  
- `DIG_FEDERATION_MODE` = `dummy` \| `live`  
- `NEXT_PUBLIC_DIG_URL` public DIG origin  

**Challenge:** Current DIG web is Vite+Express, not Next+NextAuth. Options:

1. **Preferred:** Evolve DIG web to a CHECKION-like Next island on `@msqdx/ui` + AppShell + `PlatformAssistantHost` (iframe Plexon assistant).  
2. **Interim:** Keep Vite UI but add BFF session cookie validated against Plexon (higher drift risk).  

Spec locks **Preferred** for staging/production; interim only for local demos.

## 5. Connection (Collection binding)

### Plexon-side (cross-repo)

Extend create/sync so Collections also `ensureBindingPlaceholders(…, dig)` and upsert DIG when `DIG_API_URL` / `NEXT_PUBLIC_DIG_URL` set — same pattern as CREATION onboarding.

Origin endpoint (DIG → Plexon): `POST …/dig-project-origin` (name TBD in plexon-v3).

Provisioning: `PUT/GET /api/platform/provisioning/projects/{id}` on DIG for Collection dashboard summary (capture counts, reference counts, last activity).

### DIG-side

| Concept | Storage |
|---------|---------|
| `platform_project_id` | On DIG project / capture metadata |
| `dig_project_id` | Local project row (binding external id) |
| Captures / DesignReferences | **Scoped to dig project** (hence Collection) |

Deep links: `/projects?platformProjectId=` (or DIG equivalent) — never orphan global corpora in live mode.

## 6. CHECKION peer connection

Live base: **`paths.json` → `checkionV3.stagingWeb`** = [https://checkion-v3.projects-a.plygrnd.tech](https://checkion-v3.projects-a.plygrnd.tech/)

| DIG need | How |
|----------|-----|
| Full-page JPEG | Existing attach: `POST /api/scans` + screenshot (Bearer `CHECKION_API_TOKEN` or service user) |
| Domain URL seeds (DIG-011 later) | `domain_scan_*` MCP/API with Collection’s **checkion** binding `projectId` |
| Quality panel | Correlate `checkion_scan_id`; open CHECKION result URL in new tab (user already Plexon-authed) |
| Auth for server jobs | Settings API token on CHECKION **or** service federation — **not** scraping the Sign-in page |

UI at CHECKION staging shows Plexon Sign-in — expected. DIG automation must not depend on browser login cookies.

## 7. Capability catalog entries (proposed for plexon-v3)

| Capability id | Owner | Surfaces | Notes |
|---------------|-------|----------|-------|
| `dig.capture` | `dig` | agent + flow | Start DIG capture for URL under Collection |
| `dig.enrich` | `dig` | agent + flow | Queue DIG-009 enrichment |
| `dig.reference_search` | `dig` | agent | DIG-012 search |
| `dig.reference_pack` | `dig` | agent | Assemble DesignReferencePack |
| `dig.generate` | `dig` | agent + flow | DIG-008 / look_conditioned later |

Execution stays in DIG; Plexon dispatches — same rule as `checkion.scan`.

## 8. Knowledge Pack (optional later)

DIG MAY publish distillates (e.g. `design_context` facet) into Collection Knowledge Pack — **after** DesignReference corpus exists. Do not block Wave 1 emit on pack publish.

## 9. Phased delivery (platform-aware)

| Phase | Work | Repo |
|-------|------|------|
| **P0** | Spec + paths (this doc) | DIG |
| **P1** | Plexon: product `dig` binding + sync + origin + catalog stubs | plexon-v3 |
| **P2** | DIG: auth middleware + project binding model + Coolify staging | DIG |
| **P3** | DIG-012 Wave 1–2 **Collection-scoped** emit + MCP | DIG |
| **P4** | Live CHECKION peer jobs using staging + tokens | DIG |
| **P5** | Assistant capabilities + AppShell | DIG + plexon |
| **P6** | DIG-011 seeds via CHECKION domain (only if needed) | DIG |

**Do not** ship global DesignReference MCP on an unauthenticated :8787 as “production.”

## 10. Env matrix (canonical in paths.json)

Document only — no secrets in git:

| Key | Example staging |
|-----|-----------------|
| `NEXT_PLEXON_BASE_URL` | `https://plexon-v3.projects-a.plygrnd.tech` |
| `CHECKION_API_URL` | `https://checkion-v3.projects-a.plygrnd.tech` |
| `CHECKION_API_TOKEN` | from CHECKION Settings |
| `DIG_FEDERATION_MODE` | `live` on Coolify DIG |
| `NEXT_PUBLIC_DIG_URL` | `https://dig.projects-a.plygrnd.tech` |

## 11. Non-goals

- DIG hosting CHECKION scan magazine  
- DIG replacing AUDION journey  
- Shared Postgres with CHECKION/Plexon  
- Scraping CHECKION Sign-in HTML  

## 12. Acceptance (spec-era)

- `paths.json` lists plexon + checkion staging URLs.  
- ADR-013 + this doc + open-topics challenge cross-link.  
- Explicit product id `dig` and capability ids listed.
