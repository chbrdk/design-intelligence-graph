import { paths } from './paths'
import type { JobEvent, JobSnapshot } from './stages'

const BASE = paths.digProxyBase

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json()) as T & { error?: string }
}

export async function startJob(
  url: string,
  opts?: { platformProjectId?: string | null },
): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}${paths.digApiJobs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      ...(opts?.platformProjectId
        ? { platformProjectId: opts.platformProjectId }
        : {}),
    }),
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

/** Rewrite dig-api media paths so the browser hits the Island proxy. */
export function islandMediaUrl(apiMediaPath: string | null | undefined): string | null {
  if (!apiMediaPath?.trim()) return null
  const raw = apiMediaPath.trim()
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith(BASE)) return raw
  if (raw.startsWith('/api/')) return `${BASE}${raw}`
  if (raw.startsWith('/')) return `${BASE}${paths.digApiLibrary}${raw}`
  return `${BASE}${paths.digApiLibrary}/media?path=${encodeURIComponent(raw)}`
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

export interface SectionLookItem {
  id?: string
  kind?: string
  name?: string | null
  label?: string | null
  signature?: string | null
  category?: string | null
  interpretation?: string | null
  confidence?: number | null
  crop_path?: string | null
  crop_url?: string | null
}

export interface SectionDescription {
  section_id?: string
  category?: string
  signature?: string
  stack_summary?: string
  look_summary?: string
  interaction_summary?: string
  confidence?: number
}

export interface LibraryAnalysisDetail {
  analysis: {
    status?: string | null
    model?: string | null
    design_summary?: string | null
    hypothesis_count?: number
  }
  /** Flat list for UI; API also returns grouped object — normalized in fetchAnalysisDetail. */
  items: SectionLookItem[]
  section_look: SectionLookItem[]
  package?: {
    cost?: { estimated_usd?: number; prompt_tokens?: number; completion_tokens?: number }
    vision?: { status?: string; summary?: string }
    section_descriptions?: SectionDescription[]
  }
}

function normalizeAnalysisDetail(body: Record<string, unknown>): LibraryAnalysisDetail {
  const analysis = (body.analysis ?? {}) as LibraryAnalysisDetail['analysis']
  const pkg = body.package as LibraryAnalysisDetail['package'] | undefined
  const rawItems = body.items
  let section_look: SectionLookItem[] = []
  let flat: SectionLookItem[] = []
  if (Array.isArray(rawItems)) {
    flat = rawItems as SectionLookItem[]
    section_look = flat.filter((item) => item.kind === 'section_look')
  } else if (rawItems && typeof rawItems === 'object') {
    const grouped = rawItems as Record<string, SectionLookItem[]>
    section_look = Array.isArray(grouped.section_look) ? grouped.section_look : []
    flat = Object.values(grouped).flatMap((rows) => (Array.isArray(rows) ? rows : []))
  }
  const fromPackage = pkg?.section_descriptions ?? []
  if (!section_look.length && fromPackage.length) {
    section_look = fromPackage.map((desc, index) => ({
      id: desc.section_id ?? `section_${index}`,
      kind: 'section_look',
      name: desc.section_id ?? null,
      signature: desc.signature ?? null,
      category: desc.category ?? null,
      interpretation: [desc.stack_summary, desc.look_summary, desc.interaction_summary]
        .filter(Boolean)
        .join(' · '),
      confidence: desc.confidence ?? null,
    }))
  }
  return {
    analysis,
    items: flat,
    section_look,
    ...(pkg ? { package: pkg } : {}),
  }
}

export async function fetchLibraryScreens(opts?: {
  platformProjectId?: string | null
}): Promise<LibraryScreen[]> {
  const params = new URLSearchParams()
  if (opts?.platformProjectId) params.set(paths.platformProjectQueryParam, opts.platformProjectId)
  const qs = params.toString()
  const response = await fetch(`${BASE}${paths.digApiLibrary}/screens${qs ? `?${qs}` : ''}`)
  const body = await readJson<{ screens?: LibraryScreen[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Screens failed (${response.status})`)
  return body.screens ?? []
}

export async function fetchLibrarySections(opts?: {
  category?: string
  signature?: string
  platformProjectId?: string | null
}): Promise<LibrarySection[]> {
  const params = new URLSearchParams()
  if (opts?.category) params.set('category', opts.category)
  if (opts?.signature) params.set('signature', opts.signature)
  if (opts?.platformProjectId) params.set(paths.platformProjectQueryParam, opts.platformProjectId)
  const qs = params.toString()
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/sections${qs ? `?${qs}` : ''}`,
  )
  const body = await readJson<{ sections?: LibrarySection[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Sections failed (${response.status})`)
  return body.sections ?? []
}

export async function searchLibrary(
  q: string,
  opts?: { platformProjectId?: string | null },
): Promise<LibrarySearchHit[]> {
  const params = new URLSearchParams({ q })
  if (opts?.platformProjectId) params.set(paths.platformProjectQueryParam, opts.platformProjectId)
  const response = await fetch(`${BASE}${paths.digApiLibrary}/search?${params}`)
  const body = await readJson<{ hits?: LibrarySearchHit[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Search failed (${response.status})`)
  return body.hits ?? []
}

export interface DesignReferenceHit {
  reference_id: string
  capture_run_id?: string
  category?: string
  signature?: string
  style_label?: string
  summary?: string
  similarity?: number
  platform_project_id?: string | null
}

export async function fetchDesignReferences(opts?: {
  q?: string
  similarTo?: string
  category?: string
  platformProjectId?: string | null
  limit?: number
}): Promise<DesignReferenceHit[]> {
  const params = new URLSearchParams()
  if (opts?.q) params.set('q', opts.q)
  if (opts?.similarTo) params.set('similar_to', opts.similarTo)
  if (opts?.category) params.set('category', opts.category)
  if (opts?.platformProjectId) params.set(paths.platformProjectQueryParam, opts.platformProjectId)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const response = await fetch(
    `${BASE}${paths.digApiLibraryReferences}${qs ? `?${qs}` : ''}`,
  )
  const body = await readJson<{ references?: DesignReferenceHit[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `References failed (${response.status})`)
  return body.references ?? []
}

export async function assembleReferencePromptPack(input: {
  intent: string
  referenceIds: string[]
  platformProjectId?: string | null
  synthesisMode?: 'structural' | 'look_conditioned'
}): Promise<unknown> {
  const response = await fetch(`${BASE}${paths.digApiLibraryReferences}/prompt-pack`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: input.intent,
      reference_ids: input.referenceIds,
      synthesis_mode: input.synthesisMode ?? 'look_conditioned',
      ...(input.platformProjectId
        ? { platformProjectId: input.platformProjectId }
        : {}),
    }),
  })
  const body = await readJson<Record<string, unknown>>(response)
  if (!response.ok) throw new Error(body.error ?? `Prompt-pack failed (${response.status})`)
  return body
}

export async function generateFromReferences(input: {
  intent: string
  referenceIds: string[]
  platformProjectId?: string | null
}): Promise<{ pack?: unknown; specification?: unknown }> {
  const response = await fetch(`${BASE}${paths.digApiLibraryReferences}/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: input.intent,
      reference_ids: input.referenceIds,
      ...(input.platformProjectId
        ? { platformProjectId: input.platformProjectId }
        : {}),
    }),
  })
  const body = await readJson<{ pack?: unknown; specification?: unknown; error?: string }>(response)
  if (!response.ok) throw new Error(body.error ?? `Generate failed (${response.status})`)
  return body
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
  const body = await readJson<Record<string, unknown>>(response)
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Analysis detail failed (${response.status})`)
  return normalizeAnalysisDetail(body)
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

export interface DesignFlowListItem {
  flow_id: string
  app_scope_id: string
  title: string | null
  flow_action_ids: string[]
  screen_count: number
  edge_count: number
  preview_screen_id: string | null
  preview_url: string | null
}

export interface DesignFlowGraph {
  flow_id: string
  app_scope_id: string
  title?: string
  flow_actions?: Array<{ taxonomy_id: string; confidence?: number; method?: string }>
  screens: Array<{
    flow_screen_id: string
    order: number
    capture_run_id: string
    primary_url?: string | null
    checkion_scan_id?: string | null
  }>
  edges: Array<{
    edge_id: string
    from_screen_id: string
    to_screen_id: string
    method?: string
    activation?: string
    hotspot?: { x: number; y: number; width: number; height: number; space: string }
  }>
}

export interface DesignFlowInteractive {
  schema_version: '0.1.0'
  flow_id: string
  start_screen_id: string
  steps: Array<{
    flow_screen_id: string
    order: number
    primary_url: string | null
    image_ref: string | null
    advance_anywhere: boolean
    hotspots: Array<{
      edge_id: string
      to_screen_id: string
      box: { x: number; y: number; width: number; height: number; space: 'normalized' }
    }>
  }>
}

export async function fetchDesignFlows(opts?: {
  flow_action?: string
  app_scope_id?: string
  q?: string
  limit?: number
}): Promise<DesignFlowListItem[]> {
  const params = new URLSearchParams()
  if (opts?.flow_action) params.set('flow_action', opts.flow_action)
  if (opts?.app_scope_id) params.set('app_scope_id', opts.app_scope_id)
  if (opts?.q) params.set('q', opts.q)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const response = await fetch(`${BASE}${paths.digApiLibraryFlows}${qs ? `?${qs}` : ''}`)
  const body = await readJson<{ items?: DesignFlowListItem[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Flows list failed (${response.status})`)
  return body.items ?? []
}

export async function fetchDesignFlow(flowId: string): Promise<{ flow: DesignFlowGraph }> {
  const response = await fetch(
    `${BASE}${paths.digApiLibraryFlows}/${encodeURIComponent(flowId)}`,
  )
  const body = await readJson<{ flow?: DesignFlowGraph }>(response)
  if (!response.ok) throw new Error(body.error ?? `Flow detail failed (${response.status})`)
  if (!body.flow) throw new Error('Flow detail missing flow')
  return { flow: body.flow }
}

export async function fetchDesignFlowInteractive(flowId: string): Promise<DesignFlowInteractive> {
  const response = await fetch(
    `${BASE}${paths.digApiLibraryFlows}/${encodeURIComponent(flowId)}/interactive`,
  )
  const body = await readJson<DesignFlowInteractive>(response)
  if (!response.ok) throw new Error(body.error ?? `Flow interactive failed (${response.status})`)
  return body
}

/** Within-page section narrative (not DIG-011 multi-screen Flows). */
export async function fetchPageFlows(captureRunId: string): Promise<{
  capture_run_id: string
  steps: Array<{ section_label?: string; signature?: string | null; matched_section?: unknown }>
}> {
  const response = await fetch(
    `${BASE}${paths.digApiLibraryPageFlows}?capture_run_id=${encodeURIComponent(captureRunId)}`,
  )
  const body = await readJson<{
    capture_run_id: string
    steps?: Array<{ section_label?: string; signature?: string | null; matched_section?: unknown }>
  }>(response)
  if (!response.ok) throw new Error(body.error ?? `Page narrative failed (${response.status})`)
  return { capture_run_id: body.capture_run_id, steps: body.steps ?? [] }
}
