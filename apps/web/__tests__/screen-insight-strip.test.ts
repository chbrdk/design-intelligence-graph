import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { designFacetsHaveUiSignal } from '../components/screen-insight-strip'
import type { DesignFacets } from '../lib/dig-api'

const empty: DesignFacets = {
  page_type: null,
  industry_tags: [],
  style: null,
  layout: null,
  color_mood: null,
  typography: null,
  above_fold_job: null,
  section_categories: [],
  modules: [],
  confidence: null,
}

describe('ScreenInsightStrip helpers', () => {
  it('detects empty vs populated facets', () => {
    assert.equal(designFacetsHaveUiSignal(null), false)
    assert.equal(designFacetsHaveUiSignal(empty), false)
    assert.equal(
      designFacetsHaveUiSignal({ ...empty, page_type: 'automotive_landing' }),
      true,
    )
    assert.equal(
      designFacetsHaveUiSignal({ ...empty, section_categories: ['hero'] }),
      true,
    )
  })
})
