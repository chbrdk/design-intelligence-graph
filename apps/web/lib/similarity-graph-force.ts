import type { GraphLayoutEdge } from './similarity-graph-layout'

export type ForceNode = {
  id: string
  label: string
  community?: string
  x: number
  y: number
  vx: number
  vy: number
}

export function createForceSimulation(
  nodes: Array<{ id: string; label: string; community?: string }>,
  width: number,
  height: number,
): ForceNode[] {
  const communities = [...new Set(nodes.map((n) => n.community ?? 'mixed'))]
  const communityRadius = Math.min(width, height) * 0.32
  const localRadius = Math.min(width, height) * 0.08
  const centers = new Map<string, { x: number; y: number }>()
  communities.forEach((community, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(communities.length, 1)
    centers.set(community, {
      x: width / 2 + Math.cos(angle) * communityRadius,
      y: height / 2 + Math.sin(angle) * communityRadius,
    })
  })

  const counts = new Map<string, number>()
  return nodes.map((node) => {
    const community = node.community ?? 'mixed'
    const center = centers.get(community) ?? { x: width / 2, y: height / 2 }
    const idx = counts.get(community) ?? 0
    counts.set(community, idx + 1)
    const angle = (Math.PI * 2 * idx) / Math.max(8, idx + 3)
    return {
      id: node.id,
      label: node.label,
      community,
      x: center.x + Math.cos(angle) * localRadius,
      y: center.y + Math.sin(angle) * localRadius,
      vx: 0,
      vy: 0,
    }
  })
}

export function stepForceSimulation(
  nodes: ForceNode[],
  edges: GraphLayoutEdge[],
  width: number,
  height: number,
  alpha = 0.35,
): void {
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const padding = 28
  const communities = [...new Set(nodes.map((n) => n.community ?? 'mixed'))]
  const communityRadius = Math.min(width, height) * 0.32
  const centers = new Map<string, { x: number; y: number }>()
  communities.forEach((community, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(communities.length, 1)
    centers.set(community, {
      x: width / 2 + Math.cos(angle) * communityRadius,
      y: height / 2 + Math.sin(angle) * communityRadius,
    })
  })

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!
      const b = nodes[j]!
      const same = (a.community ?? '') === (b.community ?? '')
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.max(same ? 28 : 42, Math.hypot(dx, dy))
      const force = ((same ? 380 : 620) / (dist * dist)) * alpha
      const ux = dx / dist
      const uy = dy / dist
      a.vx += ux * force
      a.vy += uy * force
      b.vx -= ux * force
      b.vy -= uy * force
    }
  }

  for (const edge of edges) {
    const ai = index.get(edge.from_id)
    const bi = index.get(edge.to_id)
    if (ai === undefined || bi === undefined) continue
    const a = nodes[ai]!
    const b = nodes[bi]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.max(1, Math.hypot(dx, dy))
    const pull = (dist - 110) * 0.045 * edge.score * alpha
    a.vx += (dx / dist) * pull
    a.vy += (dy / dist) * pull
    b.vx -= (dx / dist) * pull
    b.vy -= (dy / dist) * pull
  }

  for (const node of nodes) {
    const center = centers.get(node.community ?? 'mixed') ?? { x: width / 2, y: height / 2 }
    node.vx += (center.x - node.x) * 0.012 * alpha
    node.vy += (center.y - node.y) * 0.012 * alpha
    node.vx += (width / 2 - node.x) * 0.0004 * alpha
    node.vy += (height / 2 - node.y) * 0.0004 * alpha
    node.vx *= 0.86
    node.vy *= 0.86
    node.x += node.vx
    node.y += node.vy
    node.x = Math.min(width - padding, Math.max(padding, node.x))
    node.y = Math.min(height - padding, Math.max(padding, node.y))
  }
}
