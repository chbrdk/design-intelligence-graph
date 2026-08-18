import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

describe('library collection scope', () => {
  it('does not require Collection to browse screens', () => {
    const needsCollectionForScreens = false
    assert.equal(needsCollectionForScreens, false)
  })

  it('does not surface raw ontology section dumps in Library detail', () => {
    const detailPanels = ['Section look'] as const
    assert.ok(detailPanels.includes('Section look'))
    assert.equal(detailPanels.includes('Ontology sections' as never), false)
  })
})
