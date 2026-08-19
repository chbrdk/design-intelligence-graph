import { paths } from './paths'
import { describeCraftCluster, formatCraftGraphLabel } from './craft-graph-label'
import type { JobEvent, JobSnapshot } from './stages'
import { buildFacetSimilarityGraph, isEmbeddingGraphMissing } from './similarity-graph-fallback'
import type { SimilarityGraphNode, SimilarityGraphView } from './similarity-graph-fallback'

const BASE = paths.digProxyBase

/** Parse JSON without throwing when Traefik/Next returns an empty or truncated body. */
export async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text()
  if (!text.trim()) {
    return { error: `Empty response (${response.status})` } as T & { error?: string }
  }
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    return { error: `Invalid JSON (${response.status})` } as T & { error?: string }
  }
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

export async function fetchCaptureJobs(): Promise<JobSnapshot[]> {
  const response = await fetch(`${BASE}${paths.digApiJobs}`)
  const body = await readJson<{ jobs?: JobSnapshot[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Jobs list failed (${response.status})`)
  return body.jobs ?? []
}

export async function skipCaptureJob(jobId: string): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}${paths.digApiJobs}/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })
  const body = await readJson<JobSnapshot>(response)
  if (!response.ok) throw new Error(body.error ?? `Skip failed (${response.status})`)
  return body
}

export async function moveCaptureJob(
  jobId: string,
  direction: 'up' | 'down' | 'front',
): Promise<JobSnapshot> {
  const response = await fetch(`${BASE}${paths.digApiJobs}/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'move', direction }),
  })
  const body = await readJson<JobSnapshot>(response)
  if (!response.ok) throw new Error(body.error ?? `Reorder failed (${response.status})`)
  return body
}

export async function skipEnrichmentJob(jobId: string): Promise<EnrichmentJob> {
  const response = await fetch(`${BASE}${paths.digApiEnrichment}/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  })
  const body = await readJson<EnrichmentJob>(response)
  if (!response.ok) throw new Error(body.error ?? `Skip enrichment failed (${response.status})`)
  return body
}

export async function fetchEnrichmentJobs(): Promise<EnrichmentJob[]> {
  const response = await fetch(`${BASE}${paths.digApiEnrichment}`)
  const body = await readJson<{ jobs?: EnrichmentJob[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Enrichment list failed (${response.status})`)
  return body.jobs ?? []
}

export type ScreenFacetSummary = {
  page_type: string | null
  style: string | null
  layout: string | null
  industry_tags: string[]
  modules?: string[]
  typography?: string | null
  color_mood?: string | null
  above_fold_job?: string | null
  imagery_density?: string | null
  type_scale?: string | null
  type_image_mode?: string | null
  contrast_mode?: string | null
  composition_energy?: string | null
  chrome_weight?: string | null
  craft_tags?: string[]
}

export type LibraryFacetFilters = {
  style: string[]
  layout: string[]
  industry: string[]
}

export const EMPTY_LIBRARY_FACET_FILTERS: LibraryFacetFilters = {
  style: [],
  layout: [],
  industry: [],
}

export interface LibraryScreen {
  capture_run_id: string
  viewport_capture_id: string
  name: string
  title: string | null
  site_domain: string | null
  canonical_url: string
  primary_url?: string | null
  settled_url?: string | null
  full_page_url?: string | null
  width?: number | null
  height?: number | null
  document_width?: number | null
  document_height?: number | null
  design_facets?: ScreenFacetSummary | null
}

export type LibraryScreensQuery = {
  platformProjectId?: string | null
  style?: string | null
  layout?: string | null
  industry?: string | null
}

export function facetChipLabel(value: string): string {
  return value.replace(/_/g, ' ')
}

export function buildLibraryScreensSearchParams(opts?: LibraryScreensQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (opts?.platformProjectId) params.set(paths.platformProjectQueryParam, opts.platformProjectId)
  if (opts?.style?.trim()) params.set(paths.libraryFacetQuery.style, opts.style.trim())
  if (opts?.layout?.trim()) params.set(paths.libraryFacetQuery.layout, opts.layout.trim())
  if (opts?.industry?.trim()) params.set(paths.libraryFacetQuery.industry, opts.industry.trim())
  return params
}

export type PageRhythm = {
  schema_version?: string
  page_rhythm_version?: string
  page_arc: string
  above_fold?: {
    ingredients: string[]
    summary: string
    height: number | null
  }
  bands: Array<{
    zone: 'above_fold' | 'mid' | 'below'
    category: string
    signature: string | null
    beat: string | null
    height: number
  }>
  avoid: string[]
}

export type ScreenHotspot = {
  section_id: string
  label: string
  role: string
  box: { x: number; y: number; width: number; height: number }
  normalized: { x: number; y: number; width: number; height: number } | null
}

export type ScreenDetailSection = {
  section_id: string
  category?: string | null
  signature?: string | null
  confidence?: number | null
  root_box?: { x: number; y: number; width: number; height: number } | null
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
  section_id?: string
  taxonomy_id: string
  category: string
  signature: string
  confidence: number
  root_box?: { x: number; y: number; width: number; height: number } | null
  viewport_width?: number | null
  viewport_height?: number | null
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
  site_domain?: string | null
  canonical_url?: string | null
}

export interface SectionVisionNotes {
  overlay?: string | null
  atmosphere?: string | null
  cta_chrome?: string | null
  composition?: string | null
  media_subject?: string | null
  visible_text?: string[]
}

export interface SectionLookGaps {
  overlay?: { present?: boolean; kind?: string; notes?: string } | null
  media?: { role?: string; notes?: string } | null
  spacing?: { notes?: string } | null
  layout?: { mode?: string; notes?: string } | null
  alignment?: { text?: string; cta?: string } | null
  typography_emphasis?: string[]
  role_notes?: Array<{ role: string; notes: string }>
  color_notes?: string | null
  vision_section?: SectionVisionNotes | null
}

export interface SectionLookItem {
  id?: string
  kind?: string
  name?: string | null
  label?: string | null
  section_label?: string | null
  signature?: string | null
  category?: string | null
  interpretation?: string | null
  confidence?: number | null
  crop_path?: string | null
  crop_url?: string | null
  step_index?: number | null
  gaps?: SectionLookGaps | null
}

export interface SectionDescription {
  section_id?: string
  category?: string
  signature?: string
  stack_summary?: string
  look_summary?: string
  interaction_summary?: string
  confidence?: number
  overlay?: { present?: boolean; kind?: string; notes?: string }
  media?: { role?: string; notes?: string }
  spacing?: { notes?: string }
  layout?: { mode?: string; notes?: string }
  alignment?: { text?: string; cta?: string }
  typography_emphasis?: string[]
  role_notes?: Array<{ role: string; notes: string }>
  color_notes?: string
}

export interface LookContract {
  schema_version?: string
  look_contract_version?: string
  colors: { bg: string | null; ink: string | null; accent: string | null }
  typography: { display: string | null; body: string | null }
  radius_px: number | null
  cta_chrome: 'fill' | 'outline' | 'ghost' | null
  density: 'tight' | 'airy' | 'uneven' | null
  avoid: string[]
}

/** Stable facets for screen profile + future inspiration search. */
export interface DesignFacets {
  schema_version?: string
  facets_version?: string
  page_type: string | null
  industry_tags: string[]
  style: string | null
  layout: string | null
  color_mood: string | null
  typography: string | null
  above_fold_job: string | null
  section_categories: string[]
  modules: string[]
  confidence: number | null
  look_contract: LookContract | null
}

export interface VisualCraft {
  type_image_relationship?: string
  typography_composition?: string
  imagery_craft?: string
  spatial_craft?: string
  chrome_vs_content?: string
  rebuild_spec?: string
}

export interface VisionPageSummary {
  page_type?: string
  overall_atmosphere?: string
  color_mood?: string
  typography_feel?: string
  layout_system?: string
  vertical_rhythm?: string
  above_fold_job?: string
  above_the_fold?: string
  category_tags?: string[]
  notable_modules?: string[]
  rebuild_hints?: string
  interaction_chrome?: string
  spacing_feel?: string
  alignment?: string
  ux_flow?: string[]
  ux_strengths?: string[]
  ux_risks?: string[]
  visual_craft?: VisualCraft | null
  confidence?: number
  status?: string
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
    vision_page?: VisionPageSummary | null
    vision_layout?: {
      status?: string
      band_count?: number
      notes?: string | null
      bands?: Array<{ id?: string; label?: string; category?: string }>
    } | null
    design_facets?: DesignFacets | null
    page_rhythm?: PageRhythm | null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(String).map((item) => item.trim()).filter(Boolean)
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function normalizeLookContract(raw: unknown): LookContract | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const colorsRaw = record.colors && typeof record.colors === 'object' && !Array.isArray(record.colors)
    ? (record.colors as Record<string, unknown>)
    : {}
  const typeRaw =
    record.typography && typeof record.typography === 'object' && !Array.isArray(record.typography)
      ? (record.typography as Record<string, unknown>)
      : {}
  const chrome = record.cta_chrome
  const density = record.density
  return {
    schema_version: typeof record.schema_version === 'string' ? record.schema_version : undefined,
    look_contract_version:
      typeof record.look_contract_version === 'string' ? record.look_contract_version : undefined,
    colors: {
      bg: asNullableString(colorsRaw.bg),
      ink: asNullableString(colorsRaw.ink),
      accent: asNullableString(colorsRaw.accent),
    },
    typography: {
      display: asNullableString(typeRaw.display),
      body: asNullableString(typeRaw.body),
    },
    radius_px: typeof record.radius_px === 'number' && Number.isFinite(record.radius_px) ? record.radius_px : null,
    cta_chrome: chrome === 'fill' || chrome === 'outline' || chrome === 'ghost' ? chrome : null,
    density: density === 'tight' || density === 'airy' || density === 'uneven' ? density : null,
    avoid: asStringArray(record.avoid),
  }
}

function normalizePageRhythm(raw: unknown): PageRhythm | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const page_arc = asNullableString(record.page_arc)
  const bandsRaw = Array.isArray(record.bands) ? record.bands : []
  const bands: PageRhythm['bands'] = []
  for (const row of bandsRaw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const band = row as Record<string, unknown>
    const category = asNullableString(band.category)
    if (!category) continue
    const zone =
      band.zone === 'above_fold' || band.zone === 'mid' || band.zone === 'below' ? band.zone : 'mid'
    bands.push({
      zone,
      category,
      signature: asNullableString(band.signature),
      beat: asNullableString(band.beat),
      height: typeof band.height === 'number' && Number.isFinite(band.height) ? band.height : 0,
    })
  }
  if (!page_arc && !bands.length) return null
  const aboveRaw =
    record.above_fold && typeof record.above_fold === 'object' && !Array.isArray(record.above_fold)
      ? (record.above_fold as Record<string, unknown>)
      : {}
  return {
    schema_version: typeof record.schema_version === 'string' ? record.schema_version : undefined,
    page_rhythm_version:
      typeof record.page_rhythm_version === 'string' ? record.page_rhythm_version : undefined,
    page_arc: page_arc ?? bands.map((band) => band.category).join(' → '),
    above_fold: {
      ingredients: asStringArray(aboveRaw.ingredients),
      summary: asNullableString(aboveRaw.summary) ?? 'unknown',
      height: typeof aboveRaw.height === 'number' && Number.isFinite(aboveRaw.height) ? aboveRaw.height : null,
    },
    bands,
    avoid: asStringArray(record.avoid),
  }
}

function normalizeDesignFacets(raw: unknown): DesignFacets | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  return {
    schema_version: typeof record.schema_version === 'string' ? record.schema_version : undefined,
    facets_version: typeof record.facets_version === 'string' ? record.facets_version : undefined,
    page_type: typeof record.page_type === 'string' ? record.page_type : null,
    industry_tags: asStringArray(record.industry_tags),
    style: typeof record.style === 'string' ? record.style : null,
    layout: typeof record.layout === 'string' ? record.layout : null,
    color_mood: typeof record.color_mood === 'string' ? record.color_mood : null,
    typography: typeof record.typography === 'string' ? record.typography : null,
    above_fold_job: typeof record.above_fold_job === 'string' ? record.above_fold_job : null,
    section_categories: asStringArray(record.section_categories),
    modules: asStringArray(record.modules),
    confidence: typeof record.confidence === 'number' ? record.confidence : null,
    look_contract: normalizeLookContract(record.look_contract),
  }
}

export function normalizeAnalysisDetail(body: Record<string, unknown>): LibraryAnalysisDetail {
  const analysis = (body.analysis ?? {}) as LibraryAnalysisDetail['analysis']
  const pkgRaw = body.package as Record<string, unknown> | undefined
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
  const fromPackage = (pkgRaw?.section_descriptions as SectionDescription[] | undefined) ?? []
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
      const design_facets = normalizeDesignFacets(pkgRaw?.design_facets)
      const page_rhythm = normalizePageRhythm(pkgRaw?.page_rhythm)
      let packageExtras: LibraryAnalysisDetail['package']
      if (pkgRaw) {
        packageExtras = {
          ...(pkgRaw.cost && typeof pkgRaw.cost === 'object'
            ? { cost: pkgRaw.cost as NonNullable<LibraryAnalysisDetail['package']>['cost'] }
            : {}),
          ...(pkgRaw.vision && typeof pkgRaw.vision === 'object'
            ? { vision: pkgRaw.vision as NonNullable<LibraryAnalysisDetail['package']>['vision'] }
            : {}),
          ...(fromPackage.length ? { section_descriptions: fromPackage } : {}),
          vision_page: (pkgRaw.vision_page as VisionPageSummary | null | undefined) ?? null,
          vision_layout:
            (pkgRaw.vision_layout as NonNullable<LibraryAnalysisDetail['package']>['vision_layout']) ??
            null,
          ...(design_facets ? { design_facets } : {}),
          ...(page_rhythm ? { page_rhythm } : {}),
        }
      }
  return {
    analysis,
    items: flat,
    section_look,
    ...(packageExtras ? { package: packageExtras } : {}),
  }
}

export async function fetchLibraryScreensPage(
  opts?: LibraryScreensQuery,
): Promise<{ screens: LibraryScreen[]; facet_filters: LibraryFacetFilters }> {
  const qs = buildLibraryScreensSearchParams(opts).toString()
  const response = await fetch(`${BASE}${paths.digApiLibrary}/screens${qs ? `?${qs}` : ''}`)
  const body = await readJson<{
    screens?: LibraryScreen[]
    facet_filters?: LibraryFacetFilters
    error?: string
  }>(response)
  if (!response.ok) throw new Error(body.error ?? `Screens failed (${response.status})`)
  return {
    screens: body.screens ?? [],
    facet_filters: {
      style: Array.isArray(body.facet_filters?.style) ? body.facet_filters.style.map(String) : [],
      layout: Array.isArray(body.facet_filters?.layout) ? body.facet_filters.layout.map(String) : [],
      industry: Array.isArray(body.facet_filters?.industry)
        ? body.facet_filters.industry.map(String)
        : [],
    },
  }
}

export async function fetchLibraryScreens(opts?: LibraryScreensQuery): Promise<LibraryScreen[]> {
  const page = await fetchLibraryScreensPage(opts)
  return page.screens
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

export async function fetchSimilarityGraph(
  kind: 'craft' | 'visual' = 'craft',
): Promise<SimilarityGraphView> {
  const response = await fetch(`${BASE}${paths.digApiLibrary}/graph?kind=${encodeURIComponent(kind)}`)
  const body = await readJson<{
    kind?: 'craft' | 'visual'
    model?: string
    threshold?: number
    nodes?: Array<{
      capture_run_id: string
      site_domain: string | null
      canonical_url: string | null
      viewport_capture_id: string | null
      title: string | null
    }>
    edges?: Array<{ from_id: string; to_id: string; score: number }>
    error?: string
    message?: string
  }>(response)
  if (response.ok) {
    const apiNodes = body.nodes ?? []
    // The embeddings graph handler only returns URLs/domain + capture ids.
    // For readable UX we derive craft labels from live Library facets.
    const screens = await fetchLibraryScreens()
    const byCapture = new Map(
      screens.map((screen) => [screen.capture_run_id, screen.design_facets ?? null]),
    )
    const nodes: SimilarityGraphNode[] = apiNodes.map((node) => {
      const facets = byCapture.get(node.capture_run_id) ?? null
      return {
        ...node,
        craft_label: formatCraftGraphLabel(facets as any, {
          title: node.title,
          domain: node.site_domain,
        }),
        cluster_label: describeCraftCluster(facets as any),
      }
    })
    return {
      kind: body.kind === 'visual' ? 'visual' : 'craft',
      model: body.model ?? '',
      threshold: Number(body.threshold ?? 0),
      source: 'embeddings',
      nodes,
      edges: body.edges ?? [],
    }
  }
  if (!isEmbeddingGraphMissing(response.status, body.error)) {
    throw new Error(body.error ?? body.message ?? `Graph failed (${response.status})`)
  }
  const screens = await fetchLibraryScreens()
  return buildFacetSimilarityGraph(screens, { kind })
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

export async function fetchCapturePromptPack(
  captureRunId: string,
  opts?: {
    brief?: string
    platformProjectId?: string | null
  },
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/analyses/${encodeURIComponent(captureRunId)}/prompt-pack`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(opts?.brief ? { brief: opts.brief } : {}),
        ...(opts?.platformProjectId
          ? { platformProjectId: opts.platformProjectId }
          : {}),
      }),
    },
  )
  const body = await readJson<Record<string, unknown>>(response)
  if (!response.ok) throw new Error(body.error ?? `Prompt-pack failed (${response.status})`)
  return body
}

export function formatPromptPackForClipboard(pack: unknown): string {
  return `${JSON.stringify(pack, null, 2)}\n`
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
  hotspots: ScreenHotspot[]
  sections: ScreenDetailSection[]
  vision_layout?: {
    status: string
    band_count: number
    notes?: string | null
    source_screenshot?: string
    bands?: Array<{
      id: string
      label: string
      category: string
      box: { x: number; y: number; width: number; height: number }
      confidence: number
    }>
  } | null
}> {
  const response = await fetch(
    `${BASE}${paths.digApiLibrary}/screens/${encodeURIComponent(viewportCaptureId)}`,
  )
  const body = await readJson<{
    screen: LibraryScreen
    hotspots?: ScreenHotspot[]
    sections?: ScreenDetailSection[]
    vision_layout?: {
      status: string
      band_count: number
      notes?: string | null
      source_screenshot?: string
      bands?: Array<{
        id: string
        label: string
        category: string
        box: { x: number; y: number; width: number; height: number }
        confidence: number
      }>
    } | null
  }>(response)
  if (!response.ok) throw new Error(body.error ?? `Screen detail failed (${response.status})`)
  return {
    screen: body.screen,
    hotspots: body.hotspots ?? [],
    sections: body.sections ?? [],
    vision_layout: body.vision_layout ?? null,
  }
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

export type PinterestStatus = {
  configured: boolean
  connected: boolean
  username: string | null
  redirect_uri?: string
  max_pins?: number
}

export type PinterestBoard = {
  id: string
  name: string
  pin_count?: number
  privacy?: string
}

export async function fetchPinterestStatus(): Promise<PinterestStatus> {
  const response = await fetch(`${BASE}${paths.digApiPinterest}${paths.pinterest.statusPath}`)
  const body = await readJson<PinterestStatus>(response)
  if (!response.ok) throw new Error(body.error ?? `Pinterest status failed (${response.status})`)
  return body
}

export async function fetchPinterestAuthorizeUrl(): Promise<string> {
  const response = await fetch(`${BASE}${paths.digApiPinterest}${paths.pinterest.oauthStartPath}`)
  const body = await readJson<{ authorize_url?: string }>(response)
  if (!response.ok) throw new Error(body.error ?? `Pinterest OAuth start failed (${response.status})`)
  if (!body.authorize_url) throw new Error('Pinterest authorize URL missing')
  return body.authorize_url
}

export async function fetchPinterestBoards(): Promise<PinterestBoard[]> {
  const response = await fetch(`${BASE}${paths.digApiPinterest}${paths.pinterest.boardsPath}`)
  const body = await readJson<{ boards?: PinterestBoard[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Pinterest boards failed (${response.status})`)
  return body.boards ?? []
}

export async function uploadCaptureImages(
  files: File[],
  opts?: { platformProjectId?: string | null },
): Promise<{ queued: number; skipped: number; jobs: JobSnapshot[] }> {
  const form = new FormData()
  for (const file of files) {
    form.append(paths.imageIngest.fieldName, file)
  }
  if (opts?.platformProjectId) {
    form.append(paths.platformProjectQueryParam, opts.platformProjectId)
  }
  const response = await fetch(`${BASE}${paths.digApiJobs}${paths.imageIngest.imagesPath}`, {
    method: 'POST',
    body: form,
  })
  const body = await readJson<{ queued?: number; skipped?: number; jobs?: JobSnapshot[] }>(response)
  if (!response.ok) throw new Error(body.error ?? `Image upload failed (${response.status})`)
  return { queued: body.queued ?? 0, skipped: body.skipped ?? 0, jobs: body.jobs ?? [] }
}

export async function importPinterestBoard(
  boardId: string,
  opts?: { platformProjectId?: string | null; limit?: number },
): Promise<{ queued: number; skipped_without_image: number }> {
  const response = await fetch(`${BASE}${paths.digApiPinterest}${paths.pinterest.importPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      board_id: boardId,
      ...(opts?.platformProjectId ? { platformProjectId: opts.platformProjectId } : {}),
      ...(typeof opts?.limit === 'number' ? { limit: opts.limit } : {}),
    }),
  })
  const body = await readJson<{ queued?: number; skipped_without_image?: number }>(response)
  if (!response.ok) throw new Error(body.error ?? `Pinterest import failed (${response.status})`)
  return { queued: body.queued ?? 0, skipped_without_image: body.skipped_without_image ?? 0 }
}
