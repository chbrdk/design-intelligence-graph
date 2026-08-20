import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  craftFacetOverlapScore,
  describeCraftCluster,
  describeFacetCommunity,
  describeIndustryCluster,
  formatCraftGraphLabel,
} from '../lib/craft-graph-label'
import { buildFacetSimilarityGraph, isEmbeddingGraphMissing } from '../lib/similarity-graph-fallback'
import { createForceSimulation, stepForceSimulation } from '../lib/similarity-graph-force'
import { layoutSimilarityGraph } from '../lib/similarity-graph-layout'
import { paths } from '../lib/paths'

describe('craft graph labels', () => {
  it('formats craft atoms instead of domains', () => {
    const label = formatCraftGraphLabel({
      style: 'minimal',
      contrast_mode: 'monochrome',
      imagery_density: 'low',
      type_scale: 'large',
      industry_tags: ['insurance'],
    })
    assert.match(label, /minimal/)
    assert.match(label, /monochrome/)
    assert.match(label, /low imagery/)
    assert.doesNotMatch(label, /insurance|example\.com/)
  })

  it('classifies modern-looking screens into readable neighborhoods', () => {
    const cluster = describeCraftCluster({
      style: 'minimal',
      contrast_mode: 'monochrome',
      imagery_density: 'low',
      type_scale: 'large',
    })
    assert.equal(cluster, 'modern minimal')
    assert.equal(
      formatCraftGraphLabel(null, { title: 'Acme landing page', domain: 'acme.example' }),
      'Acme landing page',
    )
  })

  it('clusters by primary industry tag', () => {
    assert.equal(describeIndustryCluster({ industry_tags: ['marketing_agency'] }), 'marketing agency')
    assert.equal(describeIndustryCluster({ industry_tags: ['insurance', 'finance'] }), 'insurance')
    assert.equal(describeIndustryCluster({}), 'unclassified')
  })

  it('uses raw facet vocab for community coloring', () => {
    assert.equal(describeFacetCommunity({ style: 'corporate' }, 'style'), 'corporate')
    assert.equal(describeFacetCommunity({ layout: 'full-bleed stacks' }, 'layout'), 'full-bleed stacks')
    assert.equal(describeFacetCommunity({ contrast_mode: 'mixed' }, 'contrast'), 'mixed')
    assert.equal(describeFacetCommunity({ imagery_density: 'medium' }, 'imagery'), 'medium imagery')
    assert.equal(describeFacetCommunity({ type_scale: 'monumental' }, 'type'), 'monumental type')
    assert.equal(describeFacetCommunity({ composition_energy: 'calm' }, 'energy'), 'calm')
    assert.equal(describeFacetCommunity({ chrome_weight: 'minimal' }, 'chrome'), 'minimal chrome')
  })

  it('scores craft neighbors by contrast and imagery, not URL', () => {
    const score = craftFacetOverlapScore(
      { style: 'minimal', contrast_mode: 'monochrome', imagery_density: 'low', type_scale: 'large' },
      { style: 'editorial', contrast_mode: 'monochrome', imagery_density: 'low', type_scale: 'monumental' },
    )
    assert.ok(score >= 0.35)
  })
})

describe('similarity graph layout', () => {
  it('places every node inside the canvas and keeps edge ids', () => {
    const layout = layoutSimilarityGraph(
      [
        { id: 'a', label: 'minimal · monochrome' },
        { id: 'b', label: 'editorial · low imagery' },
        { id: 'c', label: 'high-energy · saturated' },
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

  it('steps a force simulation without losing nodes', () => {
    const nodes = createForceSimulation(
      [
        { id: 'a', label: 'minimal', community: 'monochrome' },
        { id: 'b', label: 'monochrome', community: 'monochrome' },
        { id: 'c', label: 'saturated', community: 'saturated' },
      ],
      960,
      560,
    )
    stepForceSimulation(nodes, [{ from_id: 'a', to_id: 'b', score: 0.8 }], 960, 560)
    assert.equal(nodes.length, 3)
    assert.ok(Number.isFinite(nodes[0]!.x))
    assert.equal(nodes[0]!.community, 'monochrome')
  })
})

describe('similarity graph fallback', () => {
  it('treats API not_found as a missing embedding graph', () => {
    assert.equal(isEmbeddingGraphMissing(404, 'not_found'), true)
    assert.equal(isEmbeddingGraphMissing(503, 'similarity_graph_unavailable'), true)
    assert.equal(isEmbeddingGraphMissing(500, 'database_unavailable'), false)
  })

  it('links screens that share craft atoms and labels nodes by craft', () => {
    const graph = buildFacetSimilarityGraph(
      [
        {
          capture_run_id: 'cap_a',
          viewport_capture_id: 'vpc_a',
          name: 'desktop',
          title: 'A Insurance',
          site_domain: 'a.example',
          canonical_url: 'https://a.example/',
          design_facets: {
            style: 'minimal',
            layout: 'full-bleed stacks',
            contrast_mode: 'monochrome',
            imagery_density: 'low',
            type_scale: 'large',
            industry_tags: ['insurance'],
          },
        },
        {
          capture_run_id: 'cap_b',
          viewport_capture_id: 'vpc_b',
          name: 'desktop',
          title: 'B Insurance',
          site_domain: 'b.example',
          canonical_url: 'https://b.example/',
          design_facets: {
            style: 'editorial',
            layout: 'editorial columns',
            contrast_mode: 'monochrome',
            imagery_density: 'low',
            type_scale: 'monumental',
            industry_tags: ['insurance'],
          },
        },
        {
          capture_run_id: 'cap_c',
          viewport_capture_id: 'vpc_c',
          name: 'desktop',
          title: 'C Media',
          site_domain: 'c.example',
          canonical_url: 'https://c.example/',
          design_facets: {
            style: 'high-energy',
            layout: 'card grid',
            contrast_mode: 'saturated',
            imagery_density: 'high',
            industry_tags: ['media'],
          },
        },
      ],
      { nodeCap: paths.similarityGraph.nodeCap, edgeCap: paths.similarityGraph.edgeCap },
    )
    assert.equal(graph.source, 'facets')
    assert.equal(graph.nodes.length, 3)
    assert.match(graph.nodes[0]?.craft_label ?? '', /modern minimal|minimal/)
    assert.match(graph.nodes[0]?.craft_label ?? '', /monochrome/)
    assert.equal(graph.nodes[0]?.cluster_label, 'modern minimal')
    assert.equal(graph.nodes[0]?.style_label, 'minimal')
    assert.equal(graph.nodes[0]?.industry_label, 'insurance')
    assert.equal(graph.nodes[2]?.industry_label, 'media')
    assert.equal(graph.edges.length, 1)
    assert.equal(graph.edges[0]?.from_id, 'cap_a')
    assert.equal(graph.edges[0]?.to_id, 'cap_b')
    assert.ok((graph.edges[0]?.score ?? 0) >= 0.35)
  })
})
