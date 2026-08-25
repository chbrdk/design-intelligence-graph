/** Graphify-style community helpers for the similarity graph. */

export type GraphCommunityTone = {
  fill: string
  stroke: string
  hull: string
}

/** Theme-aware community fills from msqdx role / status tokens. */
const TONES: GraphCommunityTone[] = [
  {
    fill: 'var(--role-sources)',
    stroke: 'var(--role-sources)',
    hull: 'color-mix(in srgb, var(--role-sources) 18%, transparent)',
  },
  {
    fill: 'var(--warn)',
    stroke: 'var(--warn)',
    hull: 'color-mix(in srgb, var(--warn) 18%, transparent)',
  },
  {
    fill: 'var(--role-signals)',
    stroke: 'var(--role-signals)',
    hull: 'color-mix(in srgb, var(--role-signals) 18%, transparent)',
  },
  {
    fill: 'var(--role-research)',
    stroke: 'var(--role-research)',
    hull: 'color-mix(in srgb, var(--role-research) 18%, transparent)',
  },
  {
    fill: 'var(--accent)',
    stroke: 'var(--accent)',
    hull: 'color-mix(in srgb, var(--accent) 18%, transparent)',
  },
  {
    fill: 'var(--role-pipeline)',
    stroke: 'var(--role-pipeline)',
    hull: 'color-mix(in srgb, var(--role-pipeline) 18%, transparent)',
  },
  {
    fill: 'var(--role-waves)',
    stroke: 'var(--role-waves)',
    hull: 'color-mix(in srgb, var(--role-waves) 18%, transparent)',
  },
  {
    fill: 'var(--ok)',
    stroke: 'var(--ok)',
    hull: 'color-mix(in srgb, var(--ok) 18%, transparent)',
  },
]

export function communityTone(community: string, orderedCommunities: string[]): GraphCommunityTone {
  const index = Math.max(0, orderedCommunities.indexOf(community))
  return TONES[index % TONES.length]!
}

export function shortGraphLabel(input: {
  domain?: string | null
  title?: string | null
  craftLabel?: string | null
}): string {
  const domain = (input.domain ?? '')
    .replace(/^www\./i, '')
    .trim()
  if (domain && domain !== 'chromewebdata') return domain
  const title = (input.title ?? '').trim()
  if (title) return title.length > 28 ? `${title.slice(0, 26)}…` : title
  const craft = (input.craftLabel ?? '').trim()
  if (!craft) return 'screen'
  const head = craft.split('·')[0]?.trim() || craft
  return head.length > 28 ? `${head.slice(0, 26)}…` : head
}

export function nodeDegree(
  nodeId: string,
  edges: Array<{ from_id: string; to_id: string }>,
): number {
  let degree = 0
  for (const edge of edges) {
    if (edge.from_id === nodeId || edge.to_id === nodeId) degree += 1
  }
  return degree
}

export function godNodeRadius(degree: number, maxDegree: number): number {
  const t = maxDegree <= 0 ? 0 : degree / maxDegree
  return 6 + t * 14
}

export type Point = { x: number; y: number }

/** Andrew's monotone chain convex hull. Returns points in CCW order. */
export function convexHull(points: Point[]): Point[] {
  const unique = [...points]
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  if (unique.length <= 1) return unique

  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Point[] = []
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }

  const upper: Point[] = []
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const p = unique[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

export function hullPath(points: Point[], padding = 18): string | null {
  const hull = convexHull(points)
  if (!hull.length) return null
  if (hull.length === 1) {
    const p = hull[0]!
    return `M ${p.x - padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x + padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x - padding} ${p.y}`
  }
  if (hull.length === 2) {
    const [a, b] = hull
    const dx = b!.x - a!.x
    const dy = b!.y - a!.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const nx = (-dy / len) * padding
    const ny = (dx / len) * padding
    return `M ${a!.x + nx} ${a!.y + ny} L ${b!.x + nx} ${b!.y + ny} L ${b!.x - nx} ${b!.y - ny} L ${a!.x - nx} ${a!.y - ny} Z`
  }
  // Expand roughly from centroid
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length
  const expanded = hull.map((p) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.max(1, Math.hypot(dx, dy))
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding }
  })
  return `M ${expanded.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`
}

export type NeighborMeta = {
  domain?: string | null
  style?: string | null
}

/**
 * Top neighbors by score with light MMR: prefer unique domains, then unique styles.
 * Keeps cosine order when diversity ties.
 */
export function neighborsFor(
  nodeId: string,
  edges: Array<{ from_id: string; to_id: string; score: number }>,
  limit = 5,
  metaById?: Map<string, NeighborMeta>,
  mmrLambda = 0.7,
): Array<{ id: string; score: number }> {
  const out: Array<{ id: string; score: number }> = []
  for (const edge of edges) {
    if (edge.from_id === nodeId) out.push({ id: edge.to_id, score: edge.score })
    else if (edge.to_id === nodeId) out.push({ id: edge.from_id, score: edge.score })
  }
  const ranked = out.sort((a, b) => b.score - a.score)
  if (!metaById?.size || limit <= 0) return ranked.slice(0, limit)

  const remaining = [...ranked]
  const picked: Array<{ id: string; score: number }> = []
  while (picked.length < limit && remaining.length) {
    let bestIdx = 0
    let bestValue = -Infinity
    for (let i = 0; i < remaining.length; i += 1) {
      const cand = remaining[i]!
      const candMeta = metaById.get(cand.id)
      const domain = (candMeta?.domain ?? '').replace(/^www\./i, '').toLowerCase()
      const style = (candMeta?.style ?? '').toLowerCase()
      let redundancy = 0
      for (const prev of picked) {
        const prevMeta = metaById.get(prev.id)
        const prevDomain = (prevMeta?.domain ?? '').replace(/^www\./i, '').toLowerCase()
        const prevStyle = (prevMeta?.style ?? '').toLowerCase()
        let sim = 0
        if (domain && prevDomain && domain === prevDomain) sim = 1
        else if (style && prevStyle && style === prevStyle) sim = 0.45
        redundancy = Math.max(redundancy, sim)
      }
      const value = mmrLambda * cand.score - (1 - mmrLambda) * redundancy
      if (value > bestValue) {
        bestValue = value
        bestIdx = i
      }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]!)
  }
  return picked
}

/** Unweighted BFS shortest path (Graphify-style path query). */
export function shortestPath(
  fromId: string,
  toId: string,
  edges: Array<{ from_id: string; to_id: string; score?: number }>,
): string[] | null {
  if (!fromId || !toId) return null
  if (fromId === toId) return [fromId]
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    const a = adj.get(edge.from_id) ?? []
    a.push(edge.to_id)
    adj.set(edge.from_id, a)
    const b = adj.get(edge.to_id) ?? []
    b.push(edge.from_id)
    adj.set(edge.to_id, b)
  }
  if (!adj.has(fromId) || !adj.has(toId)) return null
  const queue = [fromId]
  const prev = new Map<string, string | null>([[fromId, null]])
  while (queue.length) {
    const current = queue.shift()!
    if (current === toId) break
    for (const next of adj.get(current) ?? []) {
      if (prev.has(next)) continue
      prev.set(next, current)
      queue.push(next)
    }
  }
  if (!prev.has(toId)) return null
  const path: string[] = []
  let cursor: string | null = toId
  while (cursor) {
    path.push(cursor)
    cursor = prev.get(cursor) ?? null
  }
  path.reverse()
  return path
}

export function pathEdgeKeys(path: string[]): Set<string> {
  const keys = new Set<string>()
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!
    const b = path[i + 1]!
    keys.add(a < b ? `${a}__${b}` : `${b}__${a}`)
  }
  return keys
}

export function edgeKey(fromId: string, toId: string): string {
  return fromId < toId ? `${fromId}__${toId}` : `${toId}__${fromId}`
}
