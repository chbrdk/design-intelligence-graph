import {
  craftFacetOverlapScore,
  describeContrastCluster,
  describeCraftCluster,
  describeFacetCommunity,
  describeIndustryCluster,
  formatCraftGraphLabel,
  type CraftFacetLike,
} from './craft-graph-label'
import { paths } from './paths'

export type FacetGraphScreen = {
  capture_run_id: string
  viewport_capture_id: string
  name: string
  title: string | null
  site_domain: string | null
  canonical_url: string
  design_facets?: CraftFacetLike | null
}

export type SimilarityGraphNode = {
  capture_run_id: string
  site_domain: string | null
  canonical_url: string | null
  viewport_capture_id: string | null
  title: string | null
  craft_label: string
  /** @deprecated mega-bucket; prefer style_label */
  cluster_label: string
  style_label: string
  layout_label: string
  contrast_label: string
  imagery_label: string
  type_label: string
  energy_label: string
  chrome_label: string
  industry_label: string
}

export type SimilarityGraphView = {
  kind: 'craft' | 'visual'
  model: string
  threshold: number
  source: 'embeddings' | 'facets'
  total: number
  page_size: number
  neighbor_k: number
  nodes: SimilarityGraphNode[]
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

/** Neighbor graph from craft facets when GET /graph is not on dig-api yet. */
export function buildFacetSimilarityGraph(
  screens: FacetGraphScreen[],
  opts?: { nodeCap?: number; edgeCap?: number; kind?: 'craft' | 'visual'; threshold?: number },
): SimilarityGraphView {
  const nodeCap = opts?.nodeCap ?? paths.similarityGraph.nodeCap
  const edgeCap = opts?.edgeCap ?? paths.similarityGraph.edgeCap
  const threshold = opts?.threshold ?? 0.35
  const kind = opts?.kind ?? 'craft'
  const picked = desktopScreens(screens).slice(0, nodeCap)
  const nodes: SimilarityGraphNode[] = picked.map((screen) => {
    const facets = screen.design_facets
    return {
      capture_run_id: screen.capture_run_id,
      site_domain: screen.site_domain,
      canonical_url: screen.canonical_url,
      viewport_capture_id: screen.viewport_capture_id,
      title: screen.title,
      craft_label: formatCraftGraphLabel(facets, {
        title: screen.title,
        domain: screen.site_domain,
      }),
      cluster_label: describeCraftCluster(facets),
      style_label: describeFacetCommunity(facets, 'style'),
      layout_label: describeFacetCommunity(facets, 'layout'),
      contrast_label: describeContrastCluster(facets),
      imagery_label: describeFacetCommunity(facets, 'imagery'),
      type_label: describeFacetCommunity(facets, 'type'),
      energy_label: describeFacetCommunity(facets, 'energy'),
      chrome_label: describeFacetCommunity(facets, 'chrome'),
      industry_label: describeIndustryCluster(facets),
    }
  })
  const edges: SimilarityGraphView['edges'] = []
  for (let i = 0; i < picked.length; i += 1) {
    for (let j = i + 1; j < picked.length; j += 1) {
      const fa = picked[i]!.design_facets
      const fb = picked[j]!.design_facets
      if (!fa || !fb) continue
      const score = craftFacetOverlapScore(fa, fb)
      if (score < threshold) continue
      edges.push({
        from_id: picked[i]!.capture_run_id,
        to_id: picked[j]!.capture_run_id,
        score,
      })
    }
  }
  edges.sort((a, b) => b.score - a.score)
  return {
    kind,
    model: 'craft-facets',
    threshold,
    source: 'facets',
    total: nodes.length,
    page_size: paths.similarityGraph.pageSize,
    neighbor_k: paths.similarityGraph.neighborK,
    nodes,
    edges: edges.slice(0, edgeCap),
  }
}
