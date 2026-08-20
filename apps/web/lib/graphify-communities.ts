/** Graphify-style community helpers for the similarity graph. */

export type GraphCommunityTone = {
  fill: string
  stroke: string
  hull: string
}

const TONES: GraphCommunityTone[] = [
  { fill: '#84dcc6', stroke: '#3aa891', hull: 'rgba(132, 220, 198, 0.18)' },
  { fill: '#ffcc66', stroke: '#d4a017', hull: 'rgba(255, 204, 102, 0.18)' },
  { fill: '#ff8fab', stroke: '#e85a7a', hull: 'rgba(255, 143, 171, 0.18)' },
  { fill: '#9fa8ff', stroke: '#6b75e0', hull: 'rgba(159, 168, 255, 0.18)' },
  { fill: '#ff7b72', stroke: '#d9483f', hull: 'rgba(255, 123, 114, 0.18)' },
  { fill: '#8fd3ff', stroke: '#4aa3d9', hull: 'rgba(143, 211, 255, 0.18)' },
  { fill: '#c4b5fd', stroke: '#8b7cf0', hull: 'rgba(196, 181, 253, 0.18)' },
  { fill: '#86efac', stroke: '#34b36a', hull: 'rgba(134, 239, 172, 0.18)' },
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

export function neighborsFor(
  nodeId: string,
  edges: Array<{ from_id: string; to_id: string; score: number }>,
  limit = 5,
): Array<{ id: string; score: number }> {
  const out: Array<{ id: string; score: number }> = []
  for (const edge of edges) {
    if (edge.from_id === nodeId) out.push({ id: edge.to_id, score: edge.score })
    else if (edge.to_id === nodeId) out.push({ id: edge.from_id, score: edge.score })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
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
