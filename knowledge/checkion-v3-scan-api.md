# CHECKION v3 — programmatic single-URL scan + screenshot (for DIG)

**Date:** 2026-08-15  
**Source tree:** `/Volumes/DevStorage/Development/checkion-v3`  
**Staging base:** `https://checkion-v3.projects-a.plygrnd.tech` (`URL_CHECKION_V3`)

## Auth

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer checkion_<64hex>` — Settings → API tokens (`checkion_` + 64 hex) |
| `Content-Type` | `application/json` on POST |

- When Plexon auth is configured on the server: `POST /api/scans` **requires** valid Bearer or session (`getRequestUser`).
- Middleware lets any `/api/*` through if `Authorization: Bearer …` is present; GET screenshot/summary routes do **not** re-validate the token in-route — still send a real Settings token.
- Service secret (`PLEXON_SERVICE_SECRET`) is **not** accepted on scan routes.
- Verify: `POST /api/tokens/verify` → `{ ok, ownerId, tokenId }` or 401.

**Staging + API token:** Yes. Create a token in staging UI Settings, then call `https://checkion-v3.projects-a.plygrnd.tech` with that Bearer. MCP staging already uses `CHECKION_API_URL` + `CHECKION_API_TOKEN`.

## 1. Start single URL scan

```
POST {CHECKION_API_URL}/api/scans
```

**Body (required):**

```json
{
  "projectId": "<checkion project id>",
  "mode": "single",
  "url": "https://example.com/page"
}
```

**Optional:** `waitForCompletion` (bool), `platformProjectId`, `audionRunId`, `stepUrl`.

**Response:** `201` + `ScanSummary`:

```ts
{
  id: string
  projectId: string
  mode: 'single' | 'deep'
  url: string
  status: 'queued' | 'running' | 'completed' | 'failed' | …
  startedAt: string
  completedAt: string | null
  overallScore: number | null
  issueCount: number
  // …
}
```

Without `waitForCompletion`, returns immediately with `status: 'queued'` (live) or synthesized `completed` (fixture).

**Files:**  
`/Volumes/DevStorage/Development/checkion-v3/apps/web/app/api/scans/route.ts`  
`/Volumes/DevStorage/Development/checkion-v3/specs/api/scans.md`  
`/Volumes/DevStorage/Development/checkion-v3/packages/contracts/src/index.ts` (`ScanSummary`)

## 2. Poll until ready

```
GET {CHECKION_API_URL}/api/scans/{id}
```

Poll until `status === 'completed'` (or `failed` / `cancelled`).  
Screenshot is written during the live pipeline before completion; safe readiness signal is **`status === 'completed'`**. Optionally confirm:

```
GET {CHECKION_API_URL}/api/scans/{id}/overview
```

→ `screenshotUrl` like `/api/scans/{id}/screenshot` (null if no capture).

## 3. Download full-page screenshot

```
GET {CHECKION_API_URL}/api/scans/{id}/screenshot
Authorization: Bearer <token>
```

| Success | Placeholder (missing file) |
|---------|----------------------------|
| `Content-Type: image/jpeg` | `Content-Type: image/svg+xml` |
| `Cache-Control: private, max-age=3600` | `X-Screenshot: placeholder` |

**Capture (confirmed in scanner):**

```ts
page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 })
```

**Default device viewport (desktop):** `1920×1080` — full-page JPEG height = document height (variable).  
Tablet `768×1024`, mobile `375×667` exist but single scans default to desktop via pipeline.

**Files:**  
`/Volumes/DevStorage/Development/checkion-v3/apps/web/app/api/scans/[id]/screenshot/route.ts`  
`/Volumes/DevStorage/Development/checkion-v3/apps/web/lib/scan/screenshot-storage.ts`  
`/Volumes/DevStorage/Development/checkion-v3/apps/web/lib/scan/scanner.ts` (lines ~449–455)

## 4. Env vars

### DIG / MCP client

| Var | Required | Purpose |
|-----|----------|---------|
| `CHECKION_API_URL` | yes | Base URL (staging or local `:3007`) |
| `CHECKION_API_TOKEN` | yes | Settings Bearer `checkion_…` |

### checkion-v3 server (live screenshots)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres; also enables live scans unless `CHECKION_LIVE_SCANS=0` |
| `CHECKION_LIVE_SCANS` | `1` force live Puppeteer; `0` force fixtures |
| `SCAN_SCREENSHOTS_PATH` | JPEG dir (default `data/screenshots`; Coolify: `/workspace/checkion-v3/data/screenshots`) |
| `PLEXON_AUTH_URL` + `PLEXON_SERVICE_SECRET` + `AUTH_SECRET` | When set, Bearer required on mutating scan APIs |
| `NEXT_PUBLIC_CHECKION_URL` | Public origin |
| Puppeteer | Image-bundled Chrome; optional `PUPPETEER_EXECUTABLE_PATH` |

Live gate: `apps/web/lib/scan/live-scan-gate.ts` — live if `CHECKION_LIVE_SCANS=1` **or** `DATABASE_URL` (and flag not `0`).

## 5. Minimal Node fetch sequence

```js
const base = process.env.CHECKION_API_URL.replace(/\/$/, '')
const headers = {
  Authorization: `Bearer ${process.env.CHECKION_API_TOKEN}`,
  'Content-Type': 'application/json',
}

// 1. Start
const created = await fetch(`${base}/api/scans`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    projectId: process.env.CHECKION_PROJECT_ID,
    mode: 'single',
    url: targetUrl,
  }),
}).then((r) => r.json())

// 2. Poll
let scan = created
while (scan.status === 'queued' || scan.status === 'running') {
  await new Promise((r) => setTimeout(r, 2000))
  scan = await fetch(`${base}/api/scans/${encodeURIComponent(scan.id)}`, {
    headers: { Authorization: headers.Authorization },
  }).then((r) => r.json())
}
if (scan.status !== 'completed') throw new Error(scan.error ?? scan.status)

// 3. Download JPEG
const shot = await fetch(
  `${base}/api/scans/${encodeURIComponent(scan.id)}/screenshot`,
  { headers: { Authorization: headers.Authorization } },
)
const ct = shot.headers.get('content-type') // image/jpeg expected
const buf = Buffer.from(await shot.arrayBuffer())
// Reject if X-Screenshot: placeholder or ct includes svg
```

Reference client: `/Volumes/DevStorage/Development/checkion-v3/mcp-server/src/checkion-client.ts`

## Related DIG notes

- `knowledge/checkion-screenshots.md` — DIG attaches CHECKION JPEG as library SoT
- `knowledge/checkion-v3-capability-map.md` — broader capability map  
- checkion: `knowledge/paths.md`, `knowledge/staging-coolify.md`, `specs/domain/audion-journey-scan-trigger.md`
