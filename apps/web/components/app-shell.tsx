'use client'

import React, { Suspense, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  AppFrame,
  BrandCorner,
  MsqdxLogoMark,
  NavRail,
  PageTitle,
  shellFrameStyle,
} from '../lib/msqdx-ui-shell'
import { Avatar, Button, IconArrowLeft } from '@msqdx/ui'
import {
  NavIconAnalyses,
  NavIconCapture,
  NavIconEnrich,
  NavIconHome,
  NavIconLibrary,
  NavIconQueue,
} from './nav-icons'
import { PlatformAssistantHost } from './platform-assistant-host'
import { paths, withPlatformProject } from '../lib/paths'
import { useUserPrefs } from '../lib/user-prefs'

const PRIMARY_NAV = [
  { id: 'home', href: paths.routes.home, label: 'Home', icon: <NavIconHome /> },
  { id: 'projects', href: paths.routes.projects, label: 'Projects', icon: <NavIconLibrary /> },
  { id: 'capture', href: paths.routes.capture, label: 'Capture', icon: <NavIconCapture /> },
  { id: 'queue', href: paths.routes.queue, label: 'Queue', icon: <NavIconQueue /> },
  { id: 'library', href: paths.routes.library, label: 'Library', icon: <NavIconLibrary /> },
  { id: 'enrichment', href: paths.routes.enrichment, label: 'Enrichment', icon: <NavIconEnrich /> },
  { id: 'analyses', href: paths.routes.analyses, label: 'Analyses', icon: <NavIconAnalyses /> },
]

function AppShellInner({
  children,
  title,
  description,
  actions,
  status,
  onBack,
  backLabel,
}: {
  children: ReactNode
  title?: string | null
  description?: string
  actions?: ReactNode
  status?: ReactNode
  onBack?: () => void
  backLabel?: string
}) {
  const pathname = usePathname()
  const search = useSearchParams()
  const platformProjectId = search.get(paths.platformProjectQueryParam)?.trim() || null
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

  const navItems = PRIMARY_NAV.map((item) => ({
    ...item,
    href: withPlatformProject(item.href, platformProjectId),
    active: isActive(item.href),
  }))

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
          items={navItems}
          footerItems={[
            {
              id: 'settings',
              label: 'Settings',
              href: withPlatformProject(paths.routes.settings, platformProjectId),
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
            {onBack ? (
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="shell-back"
                icon={<IconArrowLeft size={22} />}
                aria-label={backLabel ?? paths.libraryCopy.shellBack}
                onClick={onBack}
              />
            ) : null}
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
      <PlatformAssistantHost platformProjectId={platformProjectId} />
    </AppFrame>
  )
}

export function AppShell(props: {
  children: ReactNode
  title?: string | null
  description?: string
  actions?: ReactNode
  status?: ReactNode
  onBack?: () => void
  backLabel?: string
}) {
  return (
    <Suspense fallback={null}>
      <AppShellInner {...props} />
    </Suspense>
  )
}
