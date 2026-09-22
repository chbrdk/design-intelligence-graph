import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  formatGraphicCraftValue,
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
    const groups = graphicCraftGroups(rows)
    assert.ok(groups.some((g) => g.group === 'tone'))
    const top = graphicCraftTopScores(rows, 'tone', 1)
    assert.equal(top[0]?.id, 'tone.editorial')
    assert.equal(formatGraphicCraftValue(top[0]!), '90')
  })
})
