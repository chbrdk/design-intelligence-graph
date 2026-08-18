'use client'

import { useEffect, useState } from 'react'
import { Alert, Chip, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchAnalyses,
  fetchLibraryScreens,
  type LibraryAnalysisSummary,
  type LibraryScreen,
} from '../lib/dig-api'
import { hrefForCaptureScreen } from '../lib/island-surfaces'
import { preferredScreenForCapture } from '../lib/library-screen-gallery'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { LibraryScreenGrid } from './library-screen-grid'

export function AnalysesPageClient() {
  const [rows, setRows] = useState<LibraryAnalysisSummary[]>([])
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([fetchAnalyses(), fetchLibraryScreens()])
      .then(([analyses, listed]) => {
        setRows(analyses.slice(0, paths.islandSurfaces.analysesListCap))
        setScreens(listed)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const cards: LibraryScreen[] = []
  for (const row of rows) {
    const screen = preferredScreenForCapture(screens, row.capture_run_id)
    if (!screen) continue
    cards.push({
      ...screen,
      title: row.site_domain || screen.title || screen.name,
    })
  }

  const unmatched = rows.filter(
    (row) => !screens.some((screen) => screen.capture_run_id === row.capture_run_id),
  )

  return (
    <AppShell title="Analyses" description={paths.libraryCopy.analysesHint}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Panel className="dig-panel">
        <LibraryScreenGrid
          screens={cards}
          empty={paths.libraryCopy.analysesEmpty}
          onOpen={(screen) => {
            const href = hrefForCaptureScreen(screens, screen.capture_run_id)
            if (href) window.location.assign(href)
          }}
        />
        {unmatched.length ? (
          <ul className="dig-list">
            {unmatched.map((row) => (
              <li key={row.capture_run_id}>
                <Chip static={true} size="sm">
                  {row.status ?? 'unknown'}
                </Chip>{' '}
                <strong>{row.site_domain ?? row.capture_run_id}</strong>
                <Text role="body">{row.design_summary ?? '—'}</Text>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </AppShell>
  )
}
