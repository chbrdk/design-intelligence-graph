import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { formatPromptPackForClipboard, normalizeAnalysisDetail } from '../lib/dig-api'
import { paths } from '../lib/paths'

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
          industry_tags: ['marketing_agency'],
          style: 'high-energy',
          layout: 'full-bleed stacks',
          color_mood: 'electric_blue',
          typography: 'bold_sans',
          above_fold_job: 'Brand momentum',
          section_categories: ['hero', 'footer'],
          modules: ['hero_banner'],
          confidence: 0.85,
          look_contract: {
            schema_version: '0.1.0',
            look_contract_version: '0.1.0',
            colors: { bg: '#050505', ink: '#f5f5f5', accent: '#00e5ff' },
            typography: { display: 'GT America 64px / 700', body: null },
            radius_px: 0,
            cta_chrome: 'outline',
            density: 'tight',
            avoid: ['glassmorphism / frosted-blur panels', 'card grid in the hero'],
          },
        },
        page_rhythm: {
          page_arc: 'hero → feature → footer',
          bands: [{ zone: 'above_fold', category: 'hero', height: 0.4 }],
        },
        vision_page: { page_type: 'marketing_agency_landing_page' },
      },
    })
    assert.equal(detail.package?.design_facets?.page_type, 'marketing_agency_landing_page')
    assert.deepEqual(detail.package?.design_facets?.industry_tags, ['marketing_agency'])
    assert.equal(detail.package?.design_facets?.layout, 'full-bleed stacks')
    assert.equal(detail.package?.vision_page?.page_type, 'marketing_agency_landing_page')
    assert.equal(detail.package?.design_facets?.look_contract?.colors.accent, '#00e5ff')
    assert.equal(detail.package?.design_facets?.look_contract?.cta_chrome, 'outline')
    assert.equal(detail.package?.page_rhythm?.page_arc, 'hero → feature → footer')
  })

  it('serializes a prompt pack for clipboard paste into Cursor', () => {
    const text = formatPromptPackForClipboard({
      role: 'design_synthesis',
      look_contract: { colors: { accent: '#d6d6d6' } },
    })
    assert.match(text, /design_synthesis/)
    assert.match(text, /#d6d6d6/)
    assert.equal(paths.libraryCopy.screenPromptPack, 'Copy prompt pack')
  })
})
