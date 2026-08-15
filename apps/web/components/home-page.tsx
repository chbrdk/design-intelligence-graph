'use client'

import { Button, Panel, Text } from '../lib/msqdx-ui'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'

export function HomePageClient() {
  return (
    <AppShell
      title="Design Intelligence"
      description="Capture design surfaces, enrich them, and browse the library — Collection capability on Plexon."
    >
      <Panel className="dig-panel dig-stack">
        <Text role="headline">Capture → enrich → reference</Text>
        <Text role="body">
          DIG is the design graph sibling to CHECKION quality scans. Start a capture, watch enrichment, then explore
          the library.
        </Text>
        <div className="dig-row">
          <Button href={paths.routes.capture} variant="primary">
            Open Capture
          </Button>
          <Button href={paths.routes.library} variant="subtle">
            Open Library
          </Button>
        </div>
      </Panel>
    </AppShell>
  )
}
