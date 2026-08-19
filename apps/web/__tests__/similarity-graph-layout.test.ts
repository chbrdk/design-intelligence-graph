import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { layoutSimilarityGraph } from '../lib/similarity-graph-layout'

describe('similarity graph layout', () => {
  it('places every node inside the canvas and keeps edge ids', () => {
    const layout = layoutSimilarityGraph(
      [
        { id: 'a', label: 'a.example' },
        { id: 'b', label: 'b.example' },
        { id: 'c', label: 'c.example' },
      ],
      [
        { from_id: 'a', to_id: 'b', score: 0.9 },
        { from_id: 'b', to_id: 'c', score: 0.75 },
      ],
      { width: 960, height: 560, ticks: 20 },
    )
    assert.equal(layout.nodes.length, 3)
    assert.equal(layout.edges.length, 2)
    for (const node of layout.nodes) {
      assert.ok(node.x >= 24 && node.x <= 936)
      assert.ok(node.y >= 24 && node.y <= 536)
    }
  })
})
