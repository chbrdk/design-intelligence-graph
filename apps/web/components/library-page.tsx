'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Alert,
  Chip,
  FilterRow,
  MagazineContentsNav,
  Panel,
  Text,
} from '../lib/msqdx-ui'
import {
  EMPTY_LIBRARY_FACET_FILTERS,
  facetChipLabel,
  fetchLibraryScreensPage,
  fetchLibrarySections,
  type LibraryFacetFilters,
  type LibraryScreen,
  type LibrarySection,
} from '../lib/dig-api'
import { formatLibraryHash, libraryModeNavItems, parseLibraryHash, type LibraryHashState } from '../lib/library-hash'
import {
  filterDeviceGalleryScreens,
  filterPrimaryGalleryScreens,
  isDeviceGalleryViewport,
  type DeviceGalleryFilter,
} from '../lib/library-screen-gallery'
import { LibraryModuleGallery } from './library-module-gallery'
import { parseModuleGalleryFilter, type ModuleGalleryFilter } from '../lib/library-module-gallery'
import { LibraryScreenGrid } from './library-screen-grid'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { LibraryFlowsPanel } from './library-flows-panel'
import { LibraryScreenDetailPanel } from './library-screen-detail'

function FacetChipRow({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string
  values: string[]
  selected: string | null
  onSelect: (value: string | null) => void
}) {
  if (!values.length) return null
  return (
    <FilterRow variant="toolbar" label={label}>
      <Chip size="sm" selected={!selected} onClick={() => onSelect(null)}>
        {paths.libraryCopy.screenFacetAll}
      </Chip>
      {values.map((value) => (
        <Chip
          key={value}
          size="sm"
          selected={selected === value}
          onClick={() => onSelect(selected === value ? null : value)}
        >
          {facetChipLabel(value)}
        </Chip>
      ))}
    </FilterRow>
  )
}

function LibraryPageInner() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const platformProjectId = searchParams.get(paths.platformProjectQueryParam)?.trim() || null
  const facetStyle = searchParams.get(paths.libraryFacetQuery.style)?.trim() || null
  const facetLayout = searchParams.get(paths.libraryFacetQuery.layout)?.trim() || null
  const facetIndustry = searchParams.get(paths.libraryFacetQuery.industry)?.trim() || null
  const [hashState, setHashState] = useState<LibraryHashState>({ view: 'screens' })
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [facetFilters, setFacetFilters] = useState<LibraryFacetFilters>(EMPTY_LIBRARY_FACET_FILTERS)
  const [sections, setSections] = useState<LibrarySection[]>([])
  const [error, setError] = useState<string | null>(null)

  function applyHash(next: LibraryHashState) {
    setHashState(next)
    if (typeof window !== 'undefined') {
      const nextHash = formatLibraryHash(next)
      if (window.location.hash !== nextHash) window.location.hash = nextHash
    }
  }

  function setFacetParam(key: keyof typeof paths.libraryFacetQuery, value: string | null) {
    const next = new URLSearchParams(searchParams.toString())
    const param = paths.libraryFacetQuery[key]
    if (value?.trim()) next.set(param, value.trim())
    else next.delete(param)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  useEffect(() => {
    const sync = () => setHashState(parseLibraryHash(window.location.hash || '#/library/screens'))
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  async function refresh() {
    setError(null)
    try {
      const page = await fetchLibraryScreensPage({
        platformProjectId,
        style: facetStyle,
        layout: facetLayout,
        industry: facetIndustry,
      })
      setScreens(page.screens)
      setFacetFilters(page.facet_filters)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setScreens([])
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), paths.libraryScreensPollMs)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Collection scope and facet query drive refresh
  }, [platformProjectId, facetStyle, facetLayout, facetIndustry])

  const moduleFilter: ModuleGalleryFilter =
    hashState.view === 'sections'
      ? parseModuleGalleryFilter(hashState.module)
      : paths.libraryModuleGallery.allValue

  useEffect(() => {
    if (hashState.view !== 'sections') return
    let cancelled = false
    async function loadModules() {
      const categories =
        moduleFilter === paths.libraryModuleGallery.allValue
          ? [...paths.libraryModuleGallery.categories]
          : [moduleFilter]
      try {
        const batches = await Promise.all(
          categories.map((category) => fetchLibrarySections({ category })),
        )
        if (!cancelled) setSections(batches.flat())
      } catch {
        if (!cancelled) setSections([])
      }
    }
    void loadModules()
    return () => {
      cancelled = true
    }
  }, [hashState.view, moduleFilter])

  function openScreen(screen: LibraryScreen) {
    applyHash({ view: 'screen_detail', viewportCaptureId: screen.viewport_capture_id })
  }

  const mode =
    hashState.view === 'flows' ||
    hashState.view === 'flow_detail' ||
    hashState.view === 'flow_interactive'
      ? 'flows'
      : hashState.view === 'sections'
        ? 'sections'
        : hashState.view === 'devices'
          ? 'devices'
          : 'screens'
  const screenDetailId =
    hashState.view === 'screen_detail' ? hashState.viewportCaptureId : null
  const detailScreen = screenDetailId
    ? screens.find((screen) => screen.viewport_capture_id === screenDetailId)
    : undefined
  const deviceViewport: DeviceGalleryFilter =
    hashState.view === 'devices' ? hashState.viewport ?? 'all' : 'all'
  const desktopScreens = filterPrimaryGalleryScreens(screens)
  const deviceScreens = filterDeviceGalleryScreens(screens, deviceViewport)

  return (
    <AppShell
      title="Library"
      description={
        screenDetailId ? undefined : 'Browse captured screens, modules, and flows.'
      }
      onBack={
        screenDetailId
          ? () =>
              applyHash(
                detailScreen && isDeviceGalleryViewport(detailScreen.name)
                  ? { view: 'devices' }
                  : { view: 'screens' },
              )
          : undefined
      }
      backLabel={screenDetailId ? paths.libraryCopy.screenDetailBack : undefined}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {platformProjectId ? (
        <Text role="meta">
          Collection: <code>{platformProjectId}</code>
        </Text>
      ) : (
        <Alert tone="info">
          Live federation needs a Collection. Open{' '}
          <a href={paths.routes.projects}>Projects</a> with{' '}
          <code>?{paths.platformProjectQueryParam}=…</code> (from Plexon). Screens still load below.
        </Alert>
      )}

      <MagazineContentsNav
        className="dig-library-contents"
        label={paths.libraryCopy.contentsLabel}
        aria-label={paths.libraryCopy.libraryModeAria}
        activeId={mode}
        columns={paths.libraryModes.length}
        items={libraryModeNavItems()}
      />

      {mode === 'flows' ? (
        <LibraryFlowsPanel
          key={`${hashState.view}-${'flowId' in hashState ? hashState.flowId : 'list'}`}
          initialFlowId={
            hashState.view === 'flow_detail' || hashState.view === 'flow_interactive'
              ? hashState.flowId
              : null
          }
          initialInteractive={hashState.view === 'flow_interactive' || hashState.view === 'flow_detail'}
          initialStep={hashState.view === 'flow_interactive' ? hashState.step ?? null : null}
          onNavigateHash={(hash) => {
            if (typeof window !== 'undefined') window.location.hash = hash
            setHashState(parseLibraryHash(hash))
          }}
        />
      ) : null}

      {mode === 'sections' ? (
        <Panel className="dig-panel">
          <LibraryModuleGallery
            sections={sections}
            screens={screens}
            filter={moduleFilter}
            onFilter={(next) => applyHash({ view: 'sections', module: next })}
            onOpen={openScreen}
          />
        </Panel>
      ) : null}

      {mode === 'screens' && screenDetailId ? (
        <LibraryScreenDetailPanel
          key={screenDetailId}
          viewportCaptureId={screenDetailId}
        />
      ) : null}

      {mode === 'screens' && !screenDetailId ? (
        <Panel className="dig-panel">
          <Text role="title">{paths.libraryCopy.screensLabel}</Text>
          <Text role="hint">{paths.libraryCopy.screenGridHint}</Text>
          <div className="dig-screen-facet-filters">
            <FacetChipRow
              label={paths.libraryCopy.screenFacetStyle}
              values={facetFilters.style}
              selected={facetStyle}
              onSelect={(value) => setFacetParam('style', value)}
            />
            <FacetChipRow
              label={paths.libraryCopy.screenFacetLayout}
              values={facetFilters.layout}
              selected={facetLayout}
              onSelect={(value) => setFacetParam('layout', value)}
            />
            <FacetChipRow
              label={paths.libraryCopy.screenFacetIndustry}
              values={facetFilters.industry}
              selected={facetIndustry}
              onSelect={(value) => setFacetParam('industry', value)}
            />
          </div>
          <LibraryScreenGrid
            screens={desktopScreens}
            variant="desktop"
            onOpen={openScreen}
            empty={
              facetStyle || facetLayout || facetIndustry
                ? paths.libraryCopy.screenFacetEmpty
                : 'No desktop screens indexed yet.'
            }
          />
        </Panel>
      ) : null}

      {mode === 'devices' ? (
        <Panel className="dig-panel">
          <Text role="title">{paths.libraryCopy.devicesTitle}</Text>
          <Text role="hint">{paths.libraryCopy.devicesHint}</Text>
          <FilterRow variant="toolbar" label="Viewport">
            <Chip
              size="sm"
              selected={deviceViewport === 'all'}
              onClick={() => applyHash({ view: 'devices' })}
            >
              {paths.libraryCopy.devicesAll}
            </Chip>
            <Chip
              size="sm"
              selected={deviceViewport === 'tablet'}
              onClick={() => applyHash({ view: 'devices', viewport: 'tablet' })}
            >
              {paths.libraryCopy.devicesTablet}
            </Chip>
            <Chip
              size="sm"
              selected={deviceViewport === 'mobile'}
              onClick={() => applyHash({ view: 'devices', viewport: 'mobile' })}
            >
              {paths.libraryCopy.devicesMobile}
            </Chip>
          </FilterRow>
          <LibraryScreenGrid
            screens={deviceScreens}
            variant="devices"
            onOpen={openScreen}
            empty={
              facetStyle || facetLayout || facetIndustry
                ? paths.libraryCopy.screenFacetEmpty
                : paths.libraryCopy.devicesEmpty
            }
          />
        </Panel>
      ) : null}
    </AppShell>
  )
}

export function LibraryPageClient() {
  return (
    <Suspense
      fallback={
        <AppShell title="Library">
          <Panel className="dig-panel">Loading…</Panel>
        </AppShell>
      }
    >
      <LibraryPageInner />
    </Suspense>
  )
}
