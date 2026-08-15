'use client'

import { useSession, signOut } from 'next-auth/react'
import { Button, Panel, Text, ToggleGroup } from '../lib/msqdx-ui'
import { paths } from '../lib/paths'
import { useUserPrefs, type UiThemeId } from '../lib/user-prefs'
import { AppShell } from './app-shell'

export function SettingsPageClient() {
  const { data } = useSession()
  const { theme, setTheme, displayName, setDisplayName } = useUserPrefs()

  return (
    <AppShell title="Settings" description="Theme, identity, and federation preferences for this island.">
      <Panel className="dig-panel dig-stack">
        <Text role="title">Appearance</Text>
        <ToggleGroup
          value={theme}
          onChange={(next) => setTheme(next as UiThemeId)}
          options={paths.themeChoices.map((id) => ({ value: id, label: id }))}
        />
        <Text role="title">Display name</Text>
        <input
          className="ds-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Text role="title">Account</Text>
        <Text role="body">{data?.user?.email ?? 'Local fixture (no Plexon session)'}</Text>
        {data?.user ? (
          <Button type="button" variant="subtle" onClick={() => void signOut({ callbackUrl: paths.routes.login })}>
            Sign out
          </Button>
        ) : null}
        <Text role="meta">
          Product `{paths.productId}` · contract `{paths.federationContract}`
        </Text>
      </Panel>
    </AppShell>
  )
}
