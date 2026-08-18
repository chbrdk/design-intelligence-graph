'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Alert,
  Button,
  Chip,
  Field,
  FilterRow,
  Input,
  MagazineContentsNav,
  Panel,
  Text,
} from '../lib/msqdx-ui'
import {
  assembleReferencePromptPack,
  EMPTY_LIBRARY_FACET_FILTERS,
  facetChipLabel,
  fetchDesignReferences,
  fetchLibraryScreensPage,
  fetchLibrarySections,
  generateFromReferences,
  islandMediaUrl,
  searchLibrary,
  type DesignReferenceHit,
  type LibraryFacetFilters,
  type LibraryScreen,
  type LibrarySearchHit,
  type LibrarySection,
} from '../lib/dig-api'
import { formatLibraryHash, libraryModeNavItems, parseLibraryHash, type LibraryHashState } from '../lib/library-hash'
import {
  filterDeviceGalleryScreens,
  filterPrimaryGalleryScreens,
  isDeviceGalleryViewport,
  preferredScreenForCapture,
  type DeviceGalleryFilter,
} from '../lib/library-screen-gallery'
import { LibraryModuleGallery } from './library-module-gallery'
import { parseModuleGalleryFilter, type ModuleGalleryFilter } from '../lib/library-module-gallery'
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

function ScreenCardGrid({
  screens,
  empty,
  variant = 'desktop',
  onOpen,
}: {
  screens: LibraryScreen[]
  empty: string
  variant?: 'desktop' | 'devices'
  onOpen: (screen: LibraryScreen) => void
}) {
  return (
    <ul className={`dig-screen-grid${variant === 'devices' ? ' dig-screen-grid--devices' : ''}`}>
      {screens.map((screen) => {
        const thumb = islandMediaUrl(screen.primary_url)
        const chips = [
          screen.design_facets?.style,
          screen.design_facets?.layout,
          screen.design_facets?.industry_tags?.[0],
        ].filter((value): value is string => Boolean(value))
        return (
          <li key={screen.viewport_capture_id}>
            <button
              type="button"
              className="dig-screen-card"
              data-viewport={screen.name}
              onClick={() => onOpen(screen)}
            >
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- package media via dig proxy
                <img src={thumb} alt="" className="dig-screen-thumb" loading="lazy" />
              ) : (
                <div className="dig-screen-thumb dig-screen-thumb--empty">No shot</div>
              )}
              <strong>{screen.title || screen.name}</strong>
              <Text role="meta">
                {screen.name} · {screen.site_domain ?? screen.canonical_url}
              </Text>
              {chips.length ? (
                <span className="dig-screen-card-facets">
                  {chips.map((chip) => (
                    <Chip key={chip} static={true} size="sm">
                      {facetChipLabel(chip)}
                    </Chip>
                  ))}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
      {!screens.length ? <li>{empty}</li> : null}
    </ul>
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
  const [references, setReferences] = useState<DesignReferenceHit[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [similarTo, setSimilarTo] = useState('')
  const [searchHits, setSearchHits] = useState<LibrarySearchHit[]>([])
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [intent, setIntent] = useState('hero marketing section')
  const [packPreview, setPackPreview] = useState<string | null>(null)
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
    const scope = { platformProjectId }
    try {
      const page = await fetchLibraryScreensPage({
        ...scope,
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

    if (!platformProjectId) {
      setReferences([])
      return
    }
    try {
      setReferences(await fetchDesignReferences({ ...scope, limit: 40 }))
    } catch (err: unknown) {
      setReferences([])
      setError(err instanceof Error ? err.message : String(err))
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

  async function onSearch() {
    const q = searchQuery.trim()
    if (!q) {
      setSearchHits([])
      return
    }
    try {
      setError(null)
      setSearchHits(await searchLibrary(q, { platformProjectId }))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSearchHits([])
    }
  }

  async function onSimilar() {
    const q = similarTo.trim()
    if (!q) return
    if (!platformProjectId) {
      setError(`Set ${paths.platformProjectQueryParam} (open Library from a Collection) for similar_to.`)
      return
    }
    try {
      setError(null)
      setReferences(
        await fetchDesignReferences({
          similarTo: q,
          platformProjectId,
          limit: 20,
        }),
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleRef(id: string) {
    setSelectedRefs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 8),
    )
  }

  async function onPromptPack() {
    if (!selectedRefs.length) {
      setError('Select at least one DesignReference')
      return
    }
    try {
      setError(null)
      const pack = await assembleReferencePromptPack({
        intent,
        referenceIds: selectedRefs,
        platformProjectId,
      })
      setPackPreview(JSON.stringify(pack, null, 2).slice(0, 4000))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onGenerate() {
    if (!selectedRefs.length) {
      setError('Select at least one DesignReference')
      return
    }
    try {
      setError(null)
      const result = await generateFromReferences({
        intent,
        referenceIds: selectedRefs,
        platformProjectId,
      })
      setPackPreview(JSON.stringify(result, null, 2).slice(0, 4000))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
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
  const deviceCount = filterDeviceGalleryScreens(screens).length

  return (
    <AppShell
      title="Library"
      description={
        screenDetailId
          ? undefined
          : 'Browse captured screens, section look, DesignReferences, and multi-screen Flows.'
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
          <code>?{paths.platformProjectQueryParam}=…</code> (from Plexon), then Library — screens still
          load below without it; DesignReferences stay Collection-scoped.
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
          initialInteractive={hashState.view === 'flow_interactive'}
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
        <>
          <Panel className="dig-panel">
            <div className="dig-row">
              <Field label="Search">
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </Field>
              <Button type="button" variant="subtle" onClick={() => void onSearch()}>
                Search
              </Button>
              <Field label="similar_to">
                <Input value={similarTo} onChange={(e) => setSimilarTo(e.target.value)} />
              </Field>
              <Button type="button" variant="subtle" onClick={() => void onSimilar()}>
                Similar refs
              </Button>
              <Button type="button" variant="subtle" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
            {searchHits.length ? (
              <ul className="dig-list">
                {searchHits.map((hit) => (
                  <li key={`${hit.capture_run_id}-${hit.label}`}>
                    <button
                      type="button"
                      className="dig-linkish"
                      onClick={() => {
                        const match = preferredScreenForCapture(screens, hit.capture_run_id)
                        if (match) openScreen(match)
                      }}
                    >
                      {hit.label} <Text role="meta">({hit.kind})</Text>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel className="dig-panel">
            <Text role="title">DesignReferences</Text>
            <div className="dig-row">
              <Field label="Intent">
                <Input value={intent} onChange={(e) => setIntent(e.target.value)} />
              </Field>
              <Button type="button" variant="subtle" onClick={() => void onPromptPack()}>
                Prompt pack
              </Button>
              <Button type="button" onClick={() => void onGenerate()}>
                Generate
              </Button>
            </div>
            <ul className="dig-list">
              {references.map((ref) => (
                <li key={ref.reference_id}>
                  <label className="dig-linkish">
                    <input
                      type="checkbox"
                      checked={selectedRefs.includes(ref.reference_id)}
                      onChange={() => toggleRef(ref.reference_id)}
                    />{' '}
                    <strong>{ref.signature ?? ref.category ?? ref.reference_id}</strong>
                    <Text role="meta">
                      {ref.style_label ?? ''}
                      {typeof ref.similarity === 'number'
                        ? ` · sim ${(ref.similarity * 100).toFixed(0)}%`
                        : ''}
                    </Text>
                  </label>
                </li>
              ))}
              {!references.length ? <li>No DesignReferences indexed yet.</li> : null}
            </ul>
            {packPreview ? (
              <pre className="dig-pre" style={{ maxHeight: 280, overflow: 'auto', fontSize: 12 }}>
                {packPreview}
              </pre>
            ) : null}
          </Panel>

          <Panel className="dig-panel">
            <Text role="title">Screens</Text>
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
            <ScreenCardGrid
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

          <Panel className="dig-panel" id="library-devices">
            <Text role="title">{paths.libraryCopy.devicesTitle}</Text>
            <Text role="hint">{paths.libraryCopy.devicesHint}</Text>
            <div className="dig-row">
              <Button type="button" variant="subtle" onClick={() => applyHash({ view: 'devices' })}>
                {paths.libraryCopy.devicesOpen}
              </Button>
              <Text role="meta">{deviceCount} tablet/mobile screens</Text>
            </div>
          </Panel>
        </>
      ) : null}

      {mode === 'devices' ? (
        <Panel className="dig-panel">
          <div className="dig-row">
            <Button type="button" variant="subtle" onClick={() => applyHash({ view: 'screens' })}>
              {paths.libraryCopy.devicesBack}
            </Button>
          </div>
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
          <ScreenCardGrid
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
