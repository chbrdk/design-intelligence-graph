import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import type { EnrichmentJob, LibraryScreen } from '../lib/dig-api'
import {
  countByStatus,
  hrefForCaptureScreen,
  libraryScreenHref,
  rankEnrichmentJobs,
  recentHomeScreens,
} from '../lib/island-surfaces'
import { paths } from '../lib/paths'

function screen(name: string, capture = 'cap_a'): LibraryScreen {
  return {
    capture_run_id: capture,
    viewport_capture_id: `vpc_${name}`,
    name,
    title: name,
    site_domain: 'example.com',
    canonical_url: 'https://example.com/',
  }
}

describe('island surfaces', () => {
  it('keeps home/enrichment caps in sync with knowledge/paths.json', () => {
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as {
      islandSurfaces: {
        homeRecentCount: number
        enrichmentListCap: number
        analysesListCap: number
        queuePollMs: number
      }
    }
    assert.equal(paths.islandSurfaces.homeRecentCount, catalog.islandSurfaces.homeRecentCount)
    assert.equal(paths.islandSurfaces.enrichmentListCap, catalog.islandSurfaces.enrichmentListCap)
    assert.equal(paths.islandSurfaces.analysesListCap, catalog.islandSurfaces.analysesListCap)
    assert.equal(paths.islandSurfaces.queuePollMs, catalog.islandSurfaces.queuePollMs)
  })

  it('links a capture to the desktop library screen', () => {
    assert.equal(
      libraryScreenHref('vpc_a'),
      `${paths.routes.library}#/library/screens/vpc_a`,
    )
    const href = hrefForCaptureScreen([screen('mobile'), screen('desktop')], 'cap_a')
    assert.equal(href, `${paths.routes.library}#/library/screens/vpc_desktop`)
  })

  it('shows recent desktop screens and ranks live enrichment first', () => {
    const recent = recentHomeScreens([
      screen('desktop', 'cap_1'),
      screen('tablet', 'cap_1'),
      screen('desktop', 'cap_2'),
    ])
    assert.deepEqual(
      recent.map((item) => item.capture_run_id),
      ['cap_1', 'cap_2'],
    )
    const jobs: EnrichmentJob[] = [
      {
        enrichment_job_id: 'e1',
        capture_run_id: 'cap_1',
        status: 'complete',
        message: 'done',
        updated_at: '2026-08-18T10:00:00Z',
      },
      {
        enrichment_job_id: 'e2',
        capture_run_id: 'cap_2',
        status: 'running',
        message: 'vl',
        updated_at: '2026-08-18T11:00:00Z',
      },
    ]
    assert.equal(rankEnrichmentJobs(jobs)[0]?.status, 'running')
    assert.deepEqual(countByStatus(jobs), [
      { status: 'complete', count: 1 },
      { status: 'running', count: 1 },
    ])
  })

  it('drops DesignReference dumps from Library screens and Analyses ontology lists', () => {
    const library = readFileSync(resolve(__dirname, '../components/library-page.tsx'), 'utf8')
    assert.doesNotMatch(library, /DesignReferences/)
    assert.doesNotMatch(library, /similar_to/)
    const analyses = readFileSync(resolve(__dirname, '../components/analyses-page.tsx'), 'utf8')
    assert.doesNotMatch(analyses, /Other facets/)
    assert.doesNotMatch(analyses, /section_look/)
    const flows = readFileSync(resolve(__dirname, '../components/library-flows-panel.tsx'), 'utf8')
    assert.match(flows, /dig-screen-grid/)
    assert.doesNotMatch(flows, /Transitions/)
    const home = readFileSync(resolve(__dirname, '../components/home-page.tsx'), 'utf8')
    assert.match(home, /LibraryScreenGrid/)
    assert.match(home, /QueueDashboard/)
  })
})
