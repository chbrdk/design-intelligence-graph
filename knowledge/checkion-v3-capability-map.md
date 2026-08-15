# CHECKION v3 — capability map for DIG reuse

**Date:** 2026-08-15 (clone path updated)  
**Source:** https://github.com/chbrdk/checkion-v3 · local: [`paths.json`](paths.json) → `checkionV3.localClone` (`/Users/m1air/GITHUB/checkion-v3`) · v2 nearby: `checkionV3.nearbyV2`  
**Ownership vs DIG:** [`dig-checkion-boundary.md`](dig-checkion-boundary.md)  
**Staging:** `https://checkion-v3.projects-a.plygrnd.tech` · MCP: `https://checkion-v3-mcp.projects-a.plygrnd.tech`

## What it is

Spec-driven island rebuild of CHECKION on `@msqdx/ui`. Capability under Plexon Collection projects. MVP: app shell · projects · single/deep scan · magazine results (overview / issues / scores) · GEO competitive jobs. Deferred: live Journey Agent, Project Report, Rank tracking, live saliency.

## 1. Page / URL scanning

| Mode | Launch | API | Result |
|------|--------|-----|--------|
| WCAG Quick single | `/scan?mode=single` | `POST /api/scans` `{mode:'single'}` | `/results/:id/overview\|issues\|detail` |
| WCAG Deep | `/scan?mode=deep` | `POST /api/scans` `{mode:'deep'}` (+ domain crawl) | results + `/domain/:id/…` |
| SEO (domain crawl) | `/scan?mode=seo` | `POST /api/domain-scans` | `/domain/:id/overview` |
| GEO (LLM presence) | `/scan?mode=geo` | `POST /api/geo-jobs` | `/geo/:id/overview\|queries` |
| Thin text only | (AUDION research) | `POST /api/fetch-page` | plain `innerText` — no WCAG/screenshot |

**Pipeline (live):** `lib/scan/pipeline.ts` → `scanner.ts` (single) / `spider.ts` (domain). Gate: `DATABASE_URL` or `CHECKION_LIVE_SCANS=1`. Domain: sitemap-first then link crawl; pause/resume/cancel via `POST /api/domain-scans/:id/control`.

**Key files:** `apps/web/lib/scan/{pipeline,scanner,spider,sitemap,scan-goto,live-scan-gate}.ts` · specs: `specs/domain/scan-modes.md`, `specs/api/scans.md`, `specs/api/domain-scans.md`, `specs/api/fetch-page.md`

## 2. Screenshots / viewport / full-page / scrolling

- **Devices:** desktop `1920×1080`, tablet `768×1024`, mobile `375×667` (`scanner.ts` `VIEWPORTS`)
- **Scroll settle:** `scan-scroll-settle.ts` — scroll down in 100px steps (cap ~5000px), back to top, 1s settle (lazy load / CLS)
- **Capture:** Puppeteer `page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 })`
- **Persist:** `screenshot-storage.ts` under `SCAN_SCREENSHOTS_PATH` (default `data/screenshots`)
- **Serve:** `GET /api/scans/:id/screenshot` → Issues canvas / overview `screenshotUrl`
- **Issues overlay coords:** fixture canvas space e.g. `1920×5053` full-page JPEG (`issue-capture-overlay.tsx`)
- **Not DIG-style:** no multi-viewport artifact tree, no settled-only vs section crops as first-class DIG stages; CHECKION is one full-page JPEG per device scan for WCAG inspect

## 3. Vision / visual analysis / GEO magazine

| Capability | Status |
|------------|--------|
| Issue markers on capture (`boundingBox`) | Live |
| Heatmap / regions / scanpath layers | Fixture overlay; **live saliency deferred** |
| On-page GEO fitness / E-E-A-T appendix | Optional via GEO job `includePageScan` + LLM stages |
| **GEO competitive presence** (primary) | Multi-provider queryRuns → citations / SoV / placement magazine — **not** screenshot vision |
| Magazine IA | Overview = narrative; Issues/Detail = report depth (`scan-result-workspace.md`) |

GEO is a **separate job type**, not `ScanMode`. Honesty: parametric LLM recall probe, not live Answer Engine with search (`knowledge/geo-measurement-honesty.md`).

## 4. Tracking / scores / issues

**Scores** (`ScoreKind`): `accessibility`, `seo`, `performance`, `best_practices`, `ux`, `eco`, `generative` — `ScoreCard { kind, label, value, max }`.

**Issues:** `IssueSummary` with severity, ruleId, section, boundingBox, runner, wcagLevel, helpUrl; domain grouped + affected pages API.

**APIs:**  
`GET /api/scans/:id/{overview,issues,scores,weakest-signal,screenshot}`  
`GET /api/domain-scans/:id/{overview,issues,seo-reading,trust-reading}`  
`GET /api/geo-jobs/:id/reading?kind=…`

Contracts: `packages/contracts/src/index.ts` · `specs/domain/scoring.md`

## 5. MCP tools DIG can call (`checkion_v3.*`)

Prefix distinct from v2 `checkion.*`. Auth: Bearer Settings API token. Package: `mcp-server/` · Spec: `specs/domain/mcp-server.md`

| Area | Tools |
|------|--------|
| Health | `checkion_v3.health` |
| Projects | `projects_list`, `project_get`, `project_create`, `project_update`, `project_delete` |
| Single/deep | `scans_list`, `scan_start`, `scan_get`, `scan_overview`, `scan_issues`, `scan_scores`, `scan_screenshot`, `scan_delete`, `scan_weakest_signal` |
| Domain | `domain_scans_list`, `domain_scan_start`, `domain_scan_get`, `domain_scan_overview`, `domain_scan_issues`, `domain_scan_control`, `domain_scan_seo_reading`, `domain_scan_trust_reading`, `project_active_domain_scans` |
| GEO | `geo_jobs_list`, `geo_job_start`, `geo_job_get`, `geo_suggest_queries`, `geo_job_reading`, `geo_job_publish_knowledge` |
| Share / research | `share_create`, `share_get`, `fetch_page` |

**Deferred MCP:** Journey agent, saliency, standalone contrast/SSL/PSI, v2 path aliases.

## 6. Specs that describe the scan pipeline

| Spec | Path |
|------|------|
| Modes + launch honesty | `specs/domain/scan-modes.md` |
| Result magazine vs report | `specs/domain/scan-result-workspace.md` |
| Rich overview bands | `specs/domain/single-scan-rich-overview.md` |
| Domain sections | `specs/domain/domain-scan-sections.md` |
| Scoring | `specs/domain/scoring.md` |
| Scans API | `specs/api/scans.md` |
| Domain API + light payload | `specs/api/domain-scans.md`, `specs/api/domain-scan-payload.md` |
| Fetch-page | `specs/api/fetch-page.md` |
| MCP | `specs/domain/mcp-server.md` |
| GEO | `specs/domain/geo-competitive-presence.md`, `geo-eeat.md`, `geo-answer-insights.md` |
| Index | `knowledge/specs-index.md` |

**Impl SoT:** `apps/web/lib/scan/pipeline.ts` → `scanner.ts` / `spider.ts` → `adapt-scan-result.ts`

## DIG reuse recommendations (full-page coverage)

### Honesty check (2026-08-15 Apple capture)

DIG Playwright still captures full-page + scroll tiles; **Library/vision SoT is CHECKION JPEG when attached** ([`checkion-screenshots.md`](checkion-screenshots.md)). Older note about “prefer DIG full-page before CHECKION” is obsolete.

### Reuse CHECKION (don’t reinvent)

Repo: [chbrdk/checkion-v3](https://github.com/chbrdk/checkion-v3)

**Screenshot SoT:** DIG Library/vision prefer CHECKION full-page JPEG when attached — see [`checkion-screenshots.md`](checkion-screenshots.md). Playwright full-page remains capture fallback if `DIG_CHECKION_SCREENSHOTS=0`.

1. **A11y / SEO / performance / UX issue corpus** — `scan_issues` + `scan_scores` + overview bands (axe/htmlcs path DIG does not own).
2. **Multi-page / domain crawl** — `domain_scan_*` + pause/resume rather than DIG inventing a spider.
3. **GEO Answer Engine presence** — `geo_job_*` (complementary to design graph).
4. **Hard pages** — CHECKION scroll-settle + overlay dismiss as fallback when DIG Playwright capture is partial/blocked; `fetch_page` for text-only.
5. **Issue overlays on full-page JPEG** — magazine-grade WCAG inspection; DIG stays design-token/section-look oriented.

### Keep in DIG

- Multi-viewport CSSOM / section recipes / `section_look` / Mobbin facets
- Local design vision budget and ontology
- Own artifact tree (`settled` + `full-page` + scroll + states)

### Bridge pattern

DIG capture job → optional CHECKION `scan_start` (same URL) → store `checkion_scan_id` on capture metadata → pull scores/issues into Library “Quality” panel; DIG continues to own design intelligence graph.

**Quick DIG fixes (no CHECKION required):** expose `full_page_url` in library API/UI; vision default to hero crop or scroll tiles, not only first viewport.
