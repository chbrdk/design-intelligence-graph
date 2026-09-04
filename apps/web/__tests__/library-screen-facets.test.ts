import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  buildLibraryScreensSearchParams,
  facetChipLabel,
} from '../lib/dig-api'
import { paths } from '../lib/paths'

describe('library screen facet filters', () => {
  it('keeps island query keys in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      libraryScreenFacets: {
        queryStyle: string
        queryLayout: string
        queryIndustry: string
        queryScreenPattern: string
        pollMs: number
      }
    }
    assert.equal(paths.libraryFacetQuery.style, catalog.libraryScreenFacets.queryStyle)
    assert.equal(paths.libraryFacetQuery.layout, catalog.libraryScreenFacets.queryLayout)
    assert.equal(paths.libraryFacetQuery.industry, catalog.libraryScreenFacets.queryIndustry)
    assert.equal(paths.libraryFacetQuery.screenPattern, catalog.libraryScreenFacets.queryScreenPattern)
    assert.equal(paths.libraryScreensPollMs, catalog.libraryScreenFacets.pollMs)
  })

  it('builds GET /screens query params from facet filters', () => {
    const params = buildLibraryScreensSearchParams({
      platformProjectId: 'pp_demo',
      style: 'high-energy',
      layout: 'full-bleed stacks',
      industry: 'media',
    })
    assert.equal(params.get(paths.platformProjectQueryParam), 'pp_demo')
    assert.equal(params.get(paths.libraryFacetQuery.style), 'high-energy')
    assert.equal(params.get(paths.libraryFacetQuery.layout), 'full-bleed stacks')
    assert.equal(params.get(paths.libraryFacetQuery.industry), 'media')
    assert.equal(buildLibraryScreensSearchParams({ style: '  ' }).toString(), '')
    assert.equal(facetChipLabel('marketing_agency'), 'marketing agency')
    assert.equal(paths.libraryCopy.screenFacetAll, 'All')
  })
})
