'use client'

import { useEffect, useState } from 'react'
import { Alert, Button, Panel, Text } from '../lib/msqdx-ui'
import { fetchEnrichmentJobs, type EnrichmentJob } from '../lib/dig-api'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'

export function EnrichmentPageClient() {
  const [jobs, setJobs] = useState<EnrichmentJob[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      setJobs(await fetchEnrichmentJobs())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setJobs([])
    }
  }

  useEffect(() => {
    void refresh()
    const handle = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(handle)
  }, [])

  return (
    <AppShell title="Enrichment" description={`Async enrichment jobs for ${paths.brandLabel} capture runs.`}>

      {error ? <Alert tone="error">{error}</Alert> : null}
      <Panel className="dig-panel">
        <Button type="button" variant="subtle" onClick={() => void refresh()}>
          Refresh
        </Button>
        <ul className="dig-list">
          {jobs.map((job) => (
            <li key={job.enrichment_job_id}>
              <strong>{job.status}</strong> · {job.capture_run_id}
              <Text role="body">{job.design_summary || job.message}</Text>
              <Text role="meta">{job.updated_at}</Text>
            </li>
          ))}
          {!jobs.length ? <li>No enrichment jobs.</li> : null}
        </ul>
      </Panel>
    </AppShell>
  )
}
