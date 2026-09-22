import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  formatGraphicCraftValue,
  graphicCraftAccordionRadarPoints,
  graphicCraftGroupFromMetricId,
  graphicCraftGroups,
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

  it('builds accordion radar from group score metrics and truncates', () => {
    const metrics: Record<string, number> = {}
    for (let i = 0; i < 12; i++) {
      metrics[`tone.axis_${String(i).padStart(2, '0')}`] = i / 11
    }
    const rows = graphicCraftMetricRows({ status: 'complete', metrics })
    const tone = graphicCraftGroups(rows).find((g) => g.group === 'tone')
    assert.ok(tone)
    const { points, truncated, scoreCount } = graphicCraftAccordionRadarPoints(tone!.rows, 10)
    assert.equal(scoreCount, 12)
    assert.equal(truncated, true)
    assert.equal(points.length, 10)
    assert.equal(points[0]?.value, 1)
    assert.ok((points[0]?.value ?? 0) >= (points[9]?.value ?? 1))
  })
})
