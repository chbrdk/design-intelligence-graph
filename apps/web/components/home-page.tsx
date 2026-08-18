'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchCaptureJobs,
  fetchEnrichmentJobs,
  fetchLibraryScreens,
  type EnrichmentJob,
  type LibraryScreen,
} from '../lib/dig-api'
import { libraryScreenHref, recentHomeScreens } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import type { JobSnapshot } from '../lib/stages'
import { AppShell } from './app-shell'
import { LibraryScreenGrid } from './library-screen-grid'
import { QueueDashboard, QueueTopStatus } from './queue-dashboard'

export function HomePageClient() {
  const router = useRouter()
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [captureJobs, setCaptureJobs] = useState<JobSnapshot[]>([])
  const [enrichmentJobs, setEnrichmentJobs] = useState<EnrichmentJob[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      const [listed, jobs, enrich] = await Promise.all([
        fetchLibraryScreens(),
        fetchCaptureJobs(),
        fetchEnrichmentJobs(),
      ])
      setScreens(listed)
      setCaptureJobs(jobs)
      setEnrichmentJobs(enrich)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh()
    const handle = window.setInterval(() => void refresh(), paths.islandSurfaces.queuePollMs)
    return () => window.clearInterval(handle)
  }, [])

  const recent = recentHomeScreens(screens)

  return (
    <AppShell
      title={paths.brandLabel}
      description={paths.libraryCopy.homeLead}
      status={<QueueTopStatus captureJobs={captureJobs} enrichmentJobs={enrichmentJobs} />}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <QueueDashboard captureJobs={captureJobs} enrichmentJobs={enrichmentJobs} />
      <Panel className="dig-panel">
        <div className="dig-row">
          <Button href={paths.routes.capture} variant="primary">
            Capture a URL
          </Button>
          <Button href={paths.routes.library} variant="subtle">
            Open Library
          </Button>
        </div>
      </Panel>
      <Panel className="dig-panel">
        <Text role="title">{paths.libraryCopy.homeRecentTitle}</Text>
        <LibraryScreenGrid
          screens={recent}
          empty={paths.libraryCopy.homeEmpty}
          onOpen={(screen) => router.push(libraryScreenHref(screen.viewport_capture_id))}
        />
      </Panel>
    </AppShell>
  )
}
