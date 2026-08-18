'use client'

import { useEffect, useState } from 'react'
import { Alert, Chip, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchEnrichmentJobs,
  fetchLibraryScreens,
  type EnrichmentJob,
  type LibraryScreen,
} from '../lib/dig-api'
import { countByStatus, hrefForCaptureScreen, rankEnrichmentJobs } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'

export function EnrichmentPageClient() {
  const [jobs, setJobs] = useState<EnrichmentJob[]>([])
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      const [listed, nextJobs] = await Promise.all([fetchLibraryScreens(), fetchEnrichmentJobs()])
      setScreens(listed)
      setJobs(nextJobs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setJobs([])
    }
  }

  useEffect(() => {
    void refresh()
    const handle = window.setInterval(() => void refresh(), 8000)
    return () => window.clearInterval(handle)
  }, [])

  const ranked = rankEnrichmentJobs(jobs)
  const tallies = countByStatus(jobs)

  return (
    <AppShell title="Enrichment" description={paths.libraryCopy.enrichmentHint}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Panel className="dig-panel">
        <div className="dig-screen-card-facets dig-status-chips">
          {tallies.map((item) => (
            <Chip key={item.status} static={true} size="sm">
              {item.status} {item.count}
            </Chip>
          ))}
        </div>
        <ul className="dig-list">
          {ranked.map((job) => {
            const href = hrefForCaptureScreen(screens, job.capture_run_id)
            return (
              <li key={job.enrichment_job_id}>
                {href ? (
                  <a href={href} className="dig-linkish">
                    <strong>{job.status}</strong> · {job.capture_run_id}
                  </a>
                ) : (
                  <>
                    <strong>{job.status}</strong> · {job.capture_run_id}
                  </>
                )}
                <Text role="body">{job.design_summary || job.message}</Text>
                <Text role="meta">{job.updated_at}</Text>
              </li>
            )
          })}
          {!ranked.length ? <li>{paths.libraryCopy.enrichmentEmpty}</li> : null}
        </ul>
      </Panel>
    </AppShell>
  )
}
