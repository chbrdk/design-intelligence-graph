import { paths } from './paths'

export type FacetGraphScreen = {
  capture_run_id: string
  viewport_capture_id: string
  name: string
  title: string | null
  site_domain: string | null
  canonical_url: string
  design_facets?: {
    style: string | null
    layout: string | null
    industry_tags: string[]
  } | null
}

export type SimilarityGraphView = {
  kind: 'craft' | 'visual'
  model: string
  threshold: number
  source: 'embeddings' | 'facets'
  nodes: Array<{
    capture_run_id: string
    site_domain: string | null
    canonical_url: string | null
    viewport_capture_id: string | null
    title: string | null
  }>
  edges: Array<{ from_id: string; to_id: string; score: number }>
}

export function isEmbeddingGraphMissing(status: number, error?: string): boolean {
  const code = (error ?? '').trim().toLowerCase()
  return (
    status === 404 ||
    code === 'not_found' ||
    code === 'similarity_graph_unavailable'
  )
}

function desktopScreens(screens: FacetGraphScreen[]): FacetGraphScreen[] {
  const primary = paths.libraryScreenGallery.primaryViewport
  const byCapture = new Map<string, FacetGraphScreen>()
  for (const screen of screens) {
    const id = screen.capture_run_id
    if (!id) continue
    const current = byCapture.get(id)
    if (!current) {
      byCapture.set(id, screen)
      continue
    }
    if (screen.name === primary && current.name !== primary) byCapture.set(id, screen)
  }
  return [...byCapture.values()]
}

function overlapScore(a: FacetGraphScreen, b: FacetGraphScreen): number {
  const fa = a.design_facets
  const fb = b.design_facets
  if (!fa || !fb) return 0
  let score = 0
  if (fa.style && fa.style === fb.style) score += 0.45
  if (fa.layout && fa.layout === fb.layout) score += 0.35
  const industries = new Set(fa.industry_tags ?? [])
  if ((fb.industry_tags ?? []).some((tag) => industries.has(tag))) score += 0.2
  return score
}

/** Neighbor graph from live Library screens when GET /graph is not on dig-api yet. */
export function buildFacetSimilarityGraph(
  screens: FacetGraphScreen[],
  opts?: { nodeCap?: number; edgeCap?: number; kind?: 'craft' | 'visual' },
): SimilarityGraphView {
  const nodeCap = opts?.nodeCap ?? paths.similarityGraph.nodeCap
  const edgeCap = opts?.edgeCap ?? paths.similarityGraph.edgeCap
  const kind = opts?.kind ?? 'craft'
  const picked = desktopScreens(screens).slice(0, nodeCap)
  const nodes = picked.map((screen) => ({
    capture_run_id: screen.capture_run_id,
    site_domain: screen.site_domain,
    canonical_url: screen.canonical_url,
    viewport_capture_id: screen.viewport_capture_id,
    title: screen.title,
  }))
  const edges: SimilarityGraphView['edges'] = []
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      const score = overlapScore(picked[i]!, picked[j]!)
      if (score < 0.45) continue
      edges.push({
        from_id: picked[i]!.capture_run_id,
        to_id: picked[j]!.capture_run_id,
        score: Math.min(1, score),
      })
    }
  }
  edges.sort((a, b) => b.score - a.score)
  return {
    kind,
    model: 'craft-facets',
    threshold: 0.45,
    source: 'facets',
    nodes,
    edges: edges.slice(0, edgeCap),
  }
}
