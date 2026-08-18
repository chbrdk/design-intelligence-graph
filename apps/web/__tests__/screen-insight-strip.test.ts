import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  designFacetsHaveUiSignal,
  lookContractHasUiSignal,
  screenInsightLedes,
} from '../components/screen-insight-strip'
import type { DesignFacets, LookContract } from '../lib/dig-api'
import { paths } from '../lib/paths'

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

  it('builds magazine ledes and skips empty facet slots', () => {
    const ledes = screenInsightLedes(
      {
        ...empty,
        page_type: 'press_release',
        style: 'editorial',
        layout: 'full-bleed stacks',
        color_mood: 'industrial blue, clinical white',
        look_contract: { ...emptyContract, density: 'airy', radius_px: 0 },
      },
      'nav',
    )
    assert.deepEqual(
      ledes.map((lede) => ({ id: lede.id, label: lede.label, value: lede.value })),
      [
        { id: 'page_type', label: paths.libraryCopy.screenInsightPageType, value: 'press release' },
        { id: 'style', label: paths.libraryCopy.screenInsightStyle, value: 'editorial' },
        { id: 'layout', label: paths.libraryCopy.screenInsightLayout, value: 'full-bleed stacks' },
        { id: 'page_arc', label: paths.libraryCopy.screenInsightPageArc, value: 'nav' },
        {
          id: 'color',
          label: paths.libraryCopy.screenInsightColor,
          value: 'industrial blue, clinical white',
        },
        { id: 'density', label: paths.libraryCopy.screenInsightDensity, value: 'airy' },
        { id: 'radius', label: paths.libraryCopy.screenInsightRadius, value: '0px' },
      ],
    )
    assert.equal(screenInsightLedes(empty, null).length, 0)
    assert.equal(paths.libraryCopy.screenMagazineLabel, 'Design brief')
    assert.equal(paths.libraryCopy.screenInsightKicker, 'Style, layout, and look')
  })
})
