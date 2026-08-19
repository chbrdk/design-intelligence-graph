export type GraphLayoutNode = {
  id: string
  x: number
  y: number
  label: string
}

export type GraphLayoutEdge = {
  from_id: string
  to_id: string
  score: number
}

/** Deterministic spring layout for a small undirected similarity graph. */
export function layoutSimilarityGraph(
  nodes: Array<{ id: string; label: string }>,
  edges: GraphLayoutEdge[],
  opts?: { width?: number; height?: number; ticks?: number },
): { nodes: GraphLayoutNode[]; edges: GraphLayoutEdge[] } {
  const width = opts?.width ?? 960
  const height = opts?.height ?? 560
  const ticks = opts?.ticks ?? 80
  const placed: GraphLayoutNode[] = nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1)
    return {
      id: node.id,
      label: node.label,
      x: width / 2 + Math.cos(angle) * Math.min(width, height) * 0.28,
      y: height / 2 + Math.sin(angle) * Math.min(width, height) * 0.28,
    }
  })
  const index = new Map(placed.map((node, i) => [node.id, i]))
  for (let tick = 0; tick < ticks; tick += 1) {
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i]!
        const b = placed[j]!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.max(40, Math.hypot(dx, dy))
        const force = 420 / (dist * dist)
        const ux = dx / dist
        const uy = dy / dist
        a.x += ux * force
        a.y += uy * force
        b.x -= ux * force
        b.y -= uy * force
      }
    }
    for (const edge of edges) {
      const ai = index.get(edge.from_id)
      const bi = index.get(edge.to_id)
      if (ai === undefined || bi === undefined) continue
      const a = placed[ai]!
      const b = placed[bi]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(1, Math.hypot(dx, dy))
      const pull = (dist - 140) * 0.04 * edge.score
      a.x += (dx / dist) * pull
      a.y += (dy / dist) * pull
      b.x -= (dx / dist) * pull
      b.y -= (dy / dist) * pull
    }
    for (const node of placed) {
      node.x = Math.min(width - 24, Math.max(24, node.x))
      node.y = Math.min(height - 24, Math.max(24, node.y))
    }
  }
  return { nodes: placed, edges }
}
