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

/** Short craft headline for a graph node. */
export function formatCraftGraphLabel(facets: CraftFacetLike | null | undefined): string {
  if (!facets) return 'screen'
  const parts: string[] = []
  if (facets.style) parts.push(humanize(facets.style))
  if (facets.contrast_mode) parts.push(humanize(facets.contrast_mode))
  if (facets.imagery_density) parts.push(`${humanize(facets.imagery_density)} imagery`)
  if (facets.type_scale) parts.push(`${humanize(facets.type_scale)} type`)
  if (facets.layout && parts.length < 3) parts.push(humanize(facets.layout))
  if (facets.composition_energy && parts.length < 4) parts.push(humanize(facets.composition_energy))
  for (const tag of facets.craft_tags ?? []) {
    if (parts.length >= 4) break
    const label = humanize(tag)
    if (!parts.includes(label)) parts.push(label)
  }
  if (!parts.length && facets.industry_tags?.[0]) parts.push(humanize(facets.industry_tags[0]))
  return parts.slice(0, 4).join(' · ') || 'screen'
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
