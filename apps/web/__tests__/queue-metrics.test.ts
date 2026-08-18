import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { paths } from '../lib/paths'
import {
  catalogFill,
  jobHostLabel,
  queuedCaptureJobs,
  queueHealthLevel,
  tallyCaptureJobs,
  tallyEnrichmentJobs,
} from '../lib/queue-metrics'
import type { JobSnapshot } from '../lib/stages'

function job(partial: Partial<JobSnapshot> & Pick<JobSnapshot, 'job_id' | 'stage'>): JobSnapshot {
  return {
    url: `https://${partial.job_id}.example/`,
    message: partial.stage,
    created_at: '2026-08-18T18:00:00Z',
    updated_at: '2026-08-18T18:00:00Z',
    event_count: 1,
    ...partial,
  }
}

describe('queue metrics', () => {
  it('tallies capture stages and treats queued as FIFO', () => {
    const jobs = [
      job({ job_id: 'a', stage: 'complete' }),
      job({ job_id: 'b', stage: 'queued', queue_index: 1, created_at: '2026-08-18T18:02:00Z' }),
      job({ job_id: 'c', stage: 'queued', queue_index: 0, created_at: '2026-08-18T18:01:00Z' }),
      job({ job_id: 'd', stage: 'capturing' }),
      job({ job_id: 'e', stage: 'failed' }),
    ]
    const tally = tallyCaptureJobs(jobs)
    assert.equal(tally.open, 3)
    assert.equal(tally.queued, 2)
    assert.deepEqual(
      queuedCaptureJobs(jobs).map((item) => item.job_id),
      ['c', 'b'],
    )
    assert.equal(jobHostLabel('https://www.ukv.de/path'), 'ukv.de')
    assert.equal(catalogFill(500, 1000), 50)
    assert.equal(queueHealthLevel(tally, tallyEnrichmentJobs([])), 'warn')
  })

  it('keeps queue copy and poll keys in paths', () => {
    assert.equal(paths.routes.queue, '/queue')
    assert.equal(paths.libraryCopy.queueTitle, 'Queue')
    assert.equal(paths.captureJobs.maxConcurrent, 6)
    const catalog = JSON.parse(
      readFileSync(resolve(__dirname, '../../../knowledge/paths.json'), 'utf8'),
    ) as { islandSurfaces: { queuePollMs: number; queueEditHeadCap: number } }
    assert.equal(paths.islandSurfaces.queuePollMs, catalog.islandSurfaces.queuePollMs)
    assert.equal(paths.islandSurfaces.queueEditHeadCap, catalog.islandSurfaces.queueEditHeadCap)
  })

  it('wires Home meters and the editable Queue page', () => {
    const home = readFileSync(resolve(__dirname, '../components/home-page.tsx'), 'utf8')
    assert.match(home, /QueueDashboard/)
    const queue = readFileSync(resolve(__dirname, '../components/queue-page.tsx'), 'utf8')
    assert.match(queue, /LayersPanel/)
    assert.match(queue, /skipCaptureJob/)
    assert.match(queue, /moveCaptureJob/)
    const shell = readFileSync(resolve(__dirname, '../components/app-shell.tsx'), 'utf8')
    assert.match(shell, /routes\.queue/)
  })
})
