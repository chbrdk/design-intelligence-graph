'use client'

import { Suspense, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, Panel, Text } from '../lib/msqdx-ui'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'

function ProjectsBody() {
  const search = useSearchParams()
  const platformProjectId = search.get(paths.platformProjectQueryParam)?.trim() || null

  const captureHref = useMemo(() => {
    if (!platformProjectId) return paths.routes.capture
    const q = new URLSearchParams({ [paths.platformProjectQueryParam]: platformProjectId })
    return `${paths.routes.capture}?${q.toString()}`
  }, [platformProjectId])

  const libraryHref = useMemo(() => {
    if (!platformProjectId) return paths.routes.library
    const q = new URLSearchParams({ [paths.platformProjectQueryParam]: platformProjectId })
    return `${paths.routes.library}?${q.toString()}`
  }, [platformProjectId])

  return (
    <Panel className="dig-panel dig-stack">
      <Text role="headline">Collection capability</Text>
      <Text role="body">
        DIG opens from a Plexon Collection — not as a separate project type. Captures and design references will be
        scoped to the bound Collection.
      </Text>
      {platformProjectId ? (
        <Text role="body">
          Active Collection: <code>{platformProjectId}</code>
        </Text>
      ) : (
        <Text role="body">
          Open via <code>/projects?{paths.platformProjectQueryParam}=…</code> from Plexon, or continue without a
          Collection context (dummy mode).
        </Text>
      )}
      <div className="dig-row">
        <Button href={captureHref} variant="primary">
          Open Capture
        </Button>
        <Button href={libraryHref} variant="subtle">
          Open Library
        </Button>
      </div>
    </Panel>
  )
}

export function ProjectsPageClient() {
  return (
    <AppShell
      title="Projects"
      description="Design Intelligence mirrors for Plexon Collections."
    >
      <Suspense fallback={<Panel className="dig-panel">Loading…</Panel>}>
        <ProjectsBody />
      </Suspense>
    </AppShell>
  )
}
