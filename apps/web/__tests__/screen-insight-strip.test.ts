import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  designFacetsHaveUiSignal,
  lookContractHasUiSignal,
  screenInsightLedes,
  screenInsightMetaChips,
} from '../components/screen-insight-strip'
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

  it('keeps four identity ledes and folds the rest into meta chips', () => {
    const facets = {
      ...empty,
      page_type: 'press_release',
      style: 'editorial',
      layout: 'full-bleed stacks',
      color_mood: 'industrial blue, clinical white',
      typography: 'grotesk',
      industry_tags: ['appliances'],
      section_categories: ['hero', 'article'],
      look_contract: { ...emptyContract, density: 'airy' as const, radius_px: 0 },
    }
    const ledes = screenInsightLedes(facets, 'nav')
    assert.deepEqual(
      ledes.map((lede) => lede.id),
      ['page_type', 'style', 'layout', 'color'],
    )
    assert.equal(ledes[0]?.value, 'press release')
    assert.deepEqual(screenInsightMetaChips(facets, 'nav'), [
      'nav',
      'grotesk',
      'airy',
      '0px',
      'appliances',
      'hero',
      'article',
    ])
    assert.equal(screenInsightLedes(empty, null).length, 0)
    assert.equal(screenInsightMetaChips(empty, null).length, 0)
  })

  it('sets the screen masthead in the thin display role used by shell headers', () => {
    const src = readFileSync(resolve(__dirname, '../components/screen-insight-strip.tsx'), 'utf8')
    assert.match(src, /role="display"/)
    assert.doesNotMatch(src, /role="headline"/)
  })
})
