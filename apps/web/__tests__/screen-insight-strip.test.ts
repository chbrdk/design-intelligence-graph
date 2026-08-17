import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { designFacetsHaveUiSignal, lookContractHasUiSignal } from '../components/screen-insight-strip'
import type { DesignFacets, LookContract } from '../lib/dig-api'

const emptyContract: LookContract = {
  colors: { bg: null, ink: null, accent: null },
  typography: { display: null, body: null },
  radius_px: null,
  cta_chrome: null,
  density: null,
  avoid: ['glassmorphism / frosted-blur panels'],
}

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
  look_contract: emptyContract,
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
    assert.equal(lookContractHasUiSignal(emptyContract), false)
    assert.equal(
      lookContractHasUiSignal({ ...emptyContract, colors: { bg: '#111', ink: null, accent: null } }),
      true,
    )
    assert.equal(
      designFacetsHaveUiSignal({
        ...empty,
        look_contract: { ...emptyContract, cta_chrome: 'outline' },
      }),
      true,
    )
  })
})
