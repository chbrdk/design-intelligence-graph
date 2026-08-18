'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Panel, Text } from '../lib/msqdx-ui'
import { fetchLibraryScreens, type LibraryScreen } from '../lib/dig-api'
import { libraryScreenHref, recentHomeScreens } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { LibraryScreenGrid } from './library-screen-grid'

export function HomePageClient() {
  const router = useRouter()
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchLibraryScreens()
      .then(setScreens)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const recent = recentHomeScreens(screens)

  return (
    <AppShell title={paths.brandLabel} description={paths.libraryCopy.homeLead}>
      {error ? <Alert tone="error">{error}</Alert> : null}
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
