import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { buildFacetSimilarityGraph, isEmbeddingGraphMissing } from '../lib/similarity-graph-fallback'
import { layoutSimilarityGraph } from '../lib/similarity-graph-layout'
import { paths } from '../lib/paths'

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

describe('similarity graph fallback', () => {
  it('treats API not_found as a missing embedding graph', () => {
    assert.equal(isEmbeddingGraphMissing(404, 'not_found'), true)
    assert.equal(isEmbeddingGraphMissing(503, 'similarity_graph_unavailable'), true)
    assert.equal(isEmbeddingGraphMissing(500, 'database_unavailable'), false)
  })

  it('links screens that share style or layout', () => {
    const graph = buildFacetSimilarityGraph(
      [
        {
          capture_run_id: 'cap_a',
          viewport_capture_id: 'vpc_a',
          name: 'desktop',
          title: 'A',
          site_domain: 'a.example',
          canonical_url: 'https://a.example/',
          design_facets: { style: 'minimal', layout: 'full-bleed stacks', industry_tags: ['insurance'] },
        },
        {
          capture_run_id: 'cap_b',
          viewport_capture_id: 'vpc_b',
          name: 'desktop',
          title: 'B',
          site_domain: 'b.example',
          canonical_url: 'https://b.example/',
          design_facets: { style: 'minimal', layout: 'editorial columns', industry_tags: ['insurance'] },
        },
        {
          capture_run_id: 'cap_c',
          viewport_capture_id: 'vpc_c',
          name: 'desktop',
          title: 'C',
          site_domain: 'c.example',
          canonical_url: 'https://c.example/',
          design_facets: { style: 'high-energy', layout: 'card grid', industry_tags: ['media'] },
        },
      ],
      { nodeCap: paths.similarityGraph.nodeCap, edgeCap: paths.similarityGraph.edgeCap },
    )
    assert.equal(graph.source, 'facets')
    assert.equal(graph.nodes.length, 3)
    assert.equal(graph.edges.length, 1)
    assert.equal(graph.edges[0]?.from_id, 'cap_a')
    assert.equal(graph.edges[0]?.to_id, 'cap_b')
    assert.ok((graph.edges[0]?.score ?? 0) >= 0.45)
  })
})
