/** Human-facing craft labels for the similarity graph (not URLs). */

export type CraftFacetLike = {
  style?: string | null
  layout?: string | null
  contrast_mode?: string | null
  imagery_density?: string | null
  type_scale?: string | null
  type_image_mode?: string | null
  composition_energy?: string | null
  chrome_weight?: string | null
  color_mood?: string | null
  craft_tags?: string[]
  industry_tags?: string[]
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').trim()
}

function titleFallback(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim()
}

function dedupe(parts: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const key = part.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(part)
  }
  return result
}

export function describeCraftCluster(facets: CraftFacetLike | null | undefined): string {
  if (!facets) return 'unclassified'
  const style = facets.style?.toLowerCase() ?? ''
  const layout = facets.layout?.toLowerCase() ?? ''
  const contrast = facets.contrast_mode?.toLowerCase() ?? ''
  const imagery = facets.imagery_density?.toLowerCase() ?? ''
  const type = facets.type_scale?.toLowerCase() ?? ''
  const energy = facets.composition_energy?.toLowerCase() ?? ''
  const chrome = facets.chrome_weight?.toLowerCase() ?? ''
  const mood = facets.color_mood?.toLowerCase() ?? ''

  if (
    style.includes('minimal') ||
    ((contrast.includes('mono') || contrast.includes('low')) &&
      (imagery.includes('low') || type.includes('large') || type.includes('monumental')))
  ) {
    return 'modern minimal'
  }
  if (style.includes('editorial') || layout.includes('column') || type.includes('monumental')) {
    return 'editorial'
  }
  if (
    imagery.includes('high') ||
    style.includes('immersive') ||
    mood.includes('vivid') ||
    mood.includes('saturated')
  ) {
    return 'image-led'
  }
  if (chrome.includes('heavy') || style.includes('corporate') || layout.includes('dashboard')) {
    return 'dense chrome'
  }
  if (energy.includes('high') || style.includes('expressive') || style.includes('playful')) {
    return 'high energy'
  }
  if (type.includes('large') || type.includes('monumental') || facets.type_image_mode === 'type-led') {
    return 'type-led'
  }
  if (facets.style) return humanize(facets.style)
  if (facets.layout) return humanize(facets.layout)
  return 'mixed'
}

export function describeGraphNode(
  facets: CraftFacetLike | null | undefined,
  fallback?: { title?: string | null; domain?: string | null },
): { cluster: string; label: string } {
  const cluster = describeCraftCluster(facets)
  if (!facets) {
    return {
      cluster,
      label: titleFallback(fallback?.title) ?? titleFallback(fallback?.domain) ?? 'unlabeled screen',
    }
  }
  const details = dedupe([
    facets.contrast_mode ? humanize(facets.contrast_mode) : '',
    facets.imagery_density ? `${humanize(facets.imagery_density)} imagery` : '',
    facets.type_scale ? `${humanize(facets.type_scale)} type` : '',
    facets.style ? humanize(facets.style) : '',
    facets.layout ? humanize(facets.layout) : '',
  ]).filter((part) => part.toLowerCase() !== cluster.toLowerCase())
  return {
    cluster,
    label: [cluster, ...details.slice(0, 2)].join(' · '),
  }
}

/** Short craft headline for a graph node. */
export function formatCraftGraphLabel(
  facets: CraftFacetLike | null | undefined,
  fallback?: { title?: string | null; domain?: string | null },
): string {
  return describeGraphNode(facets, fallback).label
}

function tagOverlap(a: string[] | undefined, b: string[] | undefined): number {
  const left = new Set((a ?? []).map((item) => item.toLowerCase()))
  const right = new Set((b ?? []).map((item) => item.toLowerCase()))
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const item of left) {
    if (right.has(item)) shared += 1
  }
  return shared / Math.max(left.size, right.size)
}

/** Craft-first neighbor score for the facet fallback graph. */
export function craftFacetOverlapScore(a: CraftFacetLike, b: CraftFacetLike): number {
  let score = 0
  if (a.style && a.style === b.style) score += 0.22
  if (a.layout && a.layout === b.layout) score += 0.14
  if (a.contrast_mode && a.contrast_mode === b.contrast_mode) score += 0.2
  if (a.imagery_density && a.imagery_density === b.imagery_density) score += 0.16
  if (a.type_scale && a.type_scale === b.type_scale) score += 0.12
  if (a.composition_energy && a.composition_energy === b.composition_energy) score += 0.08
  if (a.chrome_weight && a.chrome_weight === b.chrome_weight) score += 0.06
  score += tagOverlap(a.craft_tags, b.craft_tags) * 0.12
  const industries = new Set(a.industry_tags ?? [])
  if ((b.industry_tags ?? []).some((tag) => industries.has(tag))) score += 0.06
  return Math.min(1, score)
}
