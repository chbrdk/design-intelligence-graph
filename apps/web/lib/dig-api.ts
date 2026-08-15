import { paths } from './paths'
import type { JobEvent, JobSnapshot } from './stages'

const BASE = paths.digProxyBase

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string }
}

export async function startJob(url: string): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}${paths.digApiJobs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const body = await readJson<JobSnapshot>(response)
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`)
  return body
}

export async function fetchJob(jobId: string): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}${paths.digApiJobs}/${encodeURIComponent(jobId)}`)
  const body = await readJson<JobSnapshot>(response)
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`)
  return body
}

export function subscribeJobEvents(jobId: string, onEvent: (event: JobEvent) => void): () => void {
  const source = new EventSource(`${BASE}${paths.digApiJobs}/${encodeURIComponent(jobId)}/events`)
  const handle = (message: MessageEvent<string>) => {
    onEvent(JSON.parse(message.data) as JobEvent)
  }
  source.addEventListener('job', handle as EventListener)
  return () => {
    source.removeEventListener('job', handle as EventListener)
    source.close()
  }
}

export interface EnrichmentJob {
  enrichment_job_id: string
  capture_run_id: string
  status: string
  message: string
  design_summary?: string
  updated_at: string
  error?: string
}

export async function fetchEnrichmentJobs(): Promise<EnrichmentJob[]> {
  const response = await fetch(`${BASE}${paths.digApiEnrichment}`)
  const body = await readJson<{ jobs?: EnrichmentJob[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Enrichment list failed (${response.status})`)
  return body.jobs ?? []
}

export interface LibraryScreen {
  capture_run_id: string
  viewport_capture_id: string
  name: string
  title: string | null
  site_domain: string | null
  canonical_url: string
  primary_url?: string | null
  width: number | null
  height: number | null
}

export interface LibrarySection {
  capture_run_id: string
  viewport_name: string
  taxonomy_id: string
  category: string
  signature: string
  confidence: number
}

export interface LibrarySearchHit {
  capture_run_id: string
  kind: string
  label: string
  score: number
}

export interface LibraryAnalysisSummary {
  capture_run_id: string
  status: string | null
  model: string | null
  design_summary: string | null
  updated_at: string | null
}

export interface LibraryAnalysisDetail {
  analysis: {
    status?: string | null
    model?: string | null
    design_summary?: string | null
    hypothesis_count?: number
  }
  items: Array<{
    id: string
    kind?: string
    label?: string
    interpretation?: string | null
    signature?: string | null
  }>
  package?: {
    cost?: { estimated_usd?: number; prompt_tokens?: number; completion_tokens?: number }
    vision?: { status?: string; summary?: string }
    section_descriptions?: Array<{
      section_id?: string
      category?: string
      signature?: string
      look_summary?: string
      confidence?: number
    }>
  }
}

export async function fetchLibraryScreens(): Promise<LibraryScreen[]> {
  const response = await fetch(`${BASE}${paths.digApiLibrary}/screens`)
  const body = await readJson<{ screens?: LibraryScreen[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Screens failed (${response.status})`)
  return body.screens ?? []
}

export async function fetchLibrarySections(opts?: {
  category?: string
  signature?: string
}): Promise<LibrarySection[]> {
  const params = new URLSearchParams()
  if (opts?.category) params.set('category', opts.category)
  if (opts?.signature) params.set('signature', opts.signature)
  const qs = params.toString()
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/sections${qs ? `?${qs}` : ''}`,
  )
  const body = await readJson<{ sections?: LibrarySection[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Sections failed (${response.status})`)
  return body.sections ?? []
}

export async function searchLibrary(q: string): Promise<LibrarySearchHit[]> {
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/search?q=${encodeURIComponent(q)}`,
  )
  const body = await readJson<{ hits?: LibrarySearchHit[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Search failed (${response.status})`)
  return body.hits ?? []
}

export async function fetchAnalyses(): Promise<LibraryAnalysisSummary[]> {
  const response = await fetch(`${BASE}${paths.digApiLibrary}/analyses`)
  const body = await readJson<{ analyses?: LibraryAnalysisSummary[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Analyses failed (${response.status})`)
  return body.analyses ?? []
}

export async function fetchAnalysisDetail(captureRunId: string): Promise<LibraryAnalysisDetail> {
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/analyses/${encodeURIComponent(captureRunId)}`,
  )
  const body = await readJson<LibraryAnalysisDetail>(response)
  if (!response.ok) throw new Error(body.error ?? `Analysis detail failed (${response.status})`)
  return body
}

export async function fetchScreenDetail(viewportCaptureId: string): Promise<{
  screen: LibraryScreen
}> {
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/screens/${encodeURIComponent(viewportCaptureId)}`,
  )
  const body = await readJson<{ screen: LibraryScreen }>(response)
  if (!response.ok) throw new Error(body.error ?? `Screen detail failed (${response.status})`)
  return body
}
