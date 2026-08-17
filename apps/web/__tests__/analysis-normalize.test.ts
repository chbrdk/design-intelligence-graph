import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { normalizeAnalysisDetail } from '../lib/dig-api'

describe('analysis detail normalization', () => {
  it('reads section_look from grouped API items object', () => {
    const detail = normalizeAnalysisDetail({
      analysis: { status: 'complete' },
      items: {
        screen_patterns: [{ id: '1', kind: 'screen_pattern' }],
        section_look: [
          { id: '2', kind: 'section_look', signature: 'media' },
          { id: '3', kind: 'section_look', signature: 'heading>cta' },
        ],
      },
    })
    assert.equal(detail.items.length, 3)
    assert.equal(detail.section_look.length, 2)
  })

  it('passes design_facets through package', () => {
    const detail = normalizeAnalysisDetail({
      analysis: { status: 'complete', design_summary: 'Agency landing' },
      items: { section_look: [] },
      package: {
        design_facets: {
          schema_version: '0.1.0',
          facets_version: '0.1.0',
          page_type: 'marketing_agency_landing_page',
          industry_tags: ['creative', 'media'],
          style: 'high-energy_corporate',
          layout: 'full-bleed stacks',
          color_mood: 'electric_blue',
          typography: 'bold_sans',
          above_fold_job: 'Brand momentum',
          section_categories: ['hero', 'footer'],
          modules: ['hero_banner'],
          confidence: 0.85,
        },
        vision_page: { page_type: 'marketing_agency_landing_page' },
      },
    })
    assert.equal(detail.package?.design_facets?.page_type, 'marketing_agency_landing_page')
    assert.deepEqual(detail.package?.design_facets?.industry_tags, ['creative', 'media'])
    assert.equal(detail.package?.design_facets?.layout, 'full-bleed stacks')
    assert.equal(detail.package?.vision_page?.page_type, 'marketing_agency_landing_page')
  })
})
