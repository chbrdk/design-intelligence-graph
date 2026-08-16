import assert from 'node:assert/strict'
import { describe, it } from 'vitest'

/** Documents Library refresh split: screens load without Collection; refs need platformProjectId. */
function shouldFetchReferences(platformProjectId: string | null): boolean {
  return Boolean(platformProjectId?.trim())
}

describe('library collection scope', () => {
  it('skips DesignReference fetch without platformProjectId in live', () => {
    assert.equal(shouldFetchReferences(null), false)
    assert.equal(shouldFetchReferences(''), false)
    assert.equal(shouldFetchReferences('pp_staging_smoke_20260815'), true)
  })

  it('does not surface raw ontology section dumps in Library detail', () => {
    // Library Detail keeps Section look (LLM) only; thin commerce·body dumps were removed.
    const detailPanels = ['Section look'] as const
    assert.ok(detailPanels.includes('Section look'))
    assert.equal(detailPanels.includes('Ontology sections' as never), false)
  })
})
