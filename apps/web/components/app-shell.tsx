'use client'

import React, { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AppFrame,
  BrandCorner,
  MsqdxLogoMark,
  NavRail,
  PageTitle,
  shellFrameStyle,
} from '../lib/msqdx-ui-shell'
import { Avatar } from '@msqdx/ui'
import {
  NavIconAnalyses,
  NavIconCapture,
  NavIconEnrich,
  NavIconHome,
  NavIconLibrary,
} from './nav-icons'
import { PlatformAssistantHost } from './platform-assistant-host'
import { paths } from '../lib/paths'
import { useUserPrefs } from '../lib/user-prefs'

const PRIMARY_NAV = [
  { id: 'home', href: paths.routes.home, label: 'Home', icon: <NavIconHome /> },
  { id: 'capture', href: paths.routes.capture, label: 'Capture', icon: <NavIconCapture /> },
  { id: 'library', href: paths.routes.library, label: 'Library', icon: <NavIconLibrary /> },
  { id: 'enrichment', href: paths.routes.enrichment, label: 'Enrichment', icon: <NavIconEnrich /> },
  { id: 'analyses', href: paths.routes.analyses, label: 'Analyses', icon: <NavIconAnalyses /> },
]

export function AppShell({
  children,
  title,
  description,
  actions,
  status,
}: {
  children: ReactNode
  title?: string | null
  description?: string
  actions?: ReactNode
  status?: ReactNode
}) {
  const pathname = usePathname()
  const { displayName } = useUserPrefs()

  const frameStyle = useMemo(
    () =>
      shellFrameStyle({
        railInsetRem: paths.railInsetRem,
        railGapRem: paths.railGapRem,
        railWidthRem: paths.railWidthRem,
        mainGutterRem: paths.mainGutterRem,
      }),
    [],
  )

  function isActive(href: string): boolean {
    return href === '/' ? pathname === href : pathname.startsWith(href)
  }

  return (
    <AppFrame
      railEdge={paths.railDockEdge}
      style={frameStyle}
      brandCorner={<BrandCorner label={paths.brandLabel} borderRadius={paths.brandCornerRadiusPx} />}
      rail={
        <NavRail
          dockable
          dockStorageKey={paths.railDockStorageKey}
          defaultDockEdge={paths.railDockEdge}
          logo={<MsqdxLogoMark size={26} title="MSQ DX" />}
          logoLabel={`${paths.brandLabel} home`}
          linkComponent={Link}
          items={PRIMARY_NAV.map((item) => ({ ...item, active: isActive(item.href) }))}
          footerItems={[
            {
              id: 'settings',
              label: 'Settings',
              href: paths.routes.settings,
              active: isActive(paths.routes.settings),
              ariaLabel: 'Settings',
              icon: <Avatar name={displayName} size="sm" className="rail-avatar" />,
            },
          ]}
        />
      }
      topbar={
        <>
          <div className="topbar-brand">
            {title != null && title !== '' ? <PageTitle>{title}</PageTitle> : null}
          </div>
          <div className="topbar-right">
            {status}
            {actions}
          </div>
        </>
      }
    >
      <div className="app-main dig-stage">
        {description ? <p className="dig-page-lead">{description}</p> : null}
        {children}
      </div>
      <PlatformAssistantHost />
    </AppFrame>
  )
}
