import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  formatGraphicCraftValue,
  graphicCraftGroupFromMetricId,
  graphicCraftGroups,
  graphicCraftGroupRadarPoints,
  graphicCraftMetricRows,
  graphicCraftTopScores,
} from '../lib/graphic-craft-metrics-ui'

describe('graphic craft metrics ui helpers', () => {
  it('groups and ranks score metrics', () => {
    const rows = graphicCraftMetricRows({
      status: 'complete',
      metric_count: 3,
      filled_count: 3,
      metrics: {
        'tone.editorial': 0.9,
        'tone.minimal': 0.2,
        'risk.busy_center': 0.7,
        'color.dominant_hex': '#aabbcc',
        'prod.cta_present': true,
      },
    })
    assert.equal(rows.length, 5)
    assert.equal(graphicCraftGroupFromMetricId('comp.balance'), 'composition')
    assert.equal(graphicCraftGroupFromMetricId('prod.cta_present'), 'production')
    const groups = graphicCraftGroups(rows)
    assert.ok(groups.some((g) => g.group === 'tone'))
    assert.ok(groups.some((g) => g.group === 'production'))
    const top = graphicCraftTopScores(rows, 'tone', 1)
    assert.equal(top[0]?.id, 'tone.editorial')
    assert.equal(formatGraphicCraftValue(top[0]!), '90')
  })

  it('builds group radar means from score metrics', () => {
    const rows = graphicCraftMetricRows({
      status: 'complete',
      metrics: {
        'tone.editorial': 1,
        'tone.minimal': 0,
        'comp.balance': 0.5,
        'risk.busy_center': 0.25,
        'prod.cta_present': true,
      },
    })
    const axes = graphicCraftGroupRadarPoints(rows)
    assert.ok(axes.length >= 3)
    const tone = axes.find((a) => a.group === 'tone')
    assert.equal(tone?.label, 'Tone')
    assert.equal(tone?.value, 0.5)
    const composition = axes.find((a) => a.group === 'composition')
    assert.equal(composition?.value, 0.5)
  })
})
