import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

/**
 * Mirrors normalizeAnalysisDetail grouping — keep in sync with dig-api.ts.
 */
function normalizeItems(rawItems: unknown): { flat: number; section_look: number } {
  if (Array.isArray(rawItems)) {
    return {
      flat: rawItems.length,
      section_look: rawItems.filter((item: { kind?: string }) => item.kind === 'section_look').length,
    }
  }
  if (rawItems && typeof rawItems === 'object') {
    const grouped = rawItems as Record<string, unknown[]>
    const section_look = Array.isArray(grouped.section_look) ? grouped.section_look.length : 0
    const flat = Object.values(grouped).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0,
    )
    return { flat, section_look }
  }
  return { flat: 0, section_look: 0 }
}

describe('analysis detail normalization', () => {
  it('reads section_look from grouped API items object', () => {
    const grouped = {
      screen_patterns: [{ id: '1', kind: 'screen_pattern' }],
      section_look: [
        { id: '2', kind: 'section_look', signature: 'media' },
        { id: '3', kind: 'section_look', signature: 'heading>cta' },
      ],
    }
    assert.deepEqual(normalizeItems(grouped), { flat: 3, section_look: 2 })
  })
})
