import type { GraphLayoutEdge } from './similarity-graph-layout'

export type ForceNode = {
  id: string
  label: string
  x: number
  y: number
  vx: number
  vy: number
}

export function createForceSimulation(
  nodes: Array<{ id: string; label: string }>,
  width: number,
  height: number,
): ForceNode[] {
  const radius = Math.min(width, height) * 0.28
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1)
    return {
      id: node.id,
      label: node.label,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
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

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!
      const b = nodes[j]!
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.max(36, Math.hypot(dx, dy))
      const force = (520 / (dist * dist)) * alpha
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
    const pull = (dist - 130) * 0.05 * edge.score * alpha
    a.vx += (dx / dist) * pull
    a.vy += (dy / dist) * pull
    b.vx -= (dx / dist) * pull
    b.vy -= (dy / dist) * pull
  }

  for (const node of nodes) {
    node.vx += (width / 2 - node.x) * 0.0008 * alpha
    node.vy += (height / 2 - node.y) * 0.0008 * alpha
    node.vx *= 0.86
    node.vy *= 0.86
    node.x += node.vx
    node.y += node.vy
    node.x = Math.min(width - padding, Math.max(padding, node.x))
    node.y = Math.min(height - padding, Math.max(padding, node.y))
  }
}
