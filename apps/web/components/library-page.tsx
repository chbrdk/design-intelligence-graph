'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, Button, Field, Input, Panel, Text } from '../lib/msqdx-ui'
import {
  assembleReferencePromptPack,
  fetchDesignReferences,
  fetchLibraryScreens,
  fetchLibrarySections,
  generateFromReferences,
  islandMediaUrl,
  searchLibrary,
  type DesignReferenceHit,
  type LibraryScreen,
  type LibrarySearchHit,
  type LibrarySection,
} from '../lib/dig-api'
import { formatLibraryHash, parseLibraryHash, type LibraryHashState } from '../lib/library-hash'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { LibraryFlowsPanel } from './library-flows-panel'
import { LibraryScreenDetailPanel } from './library-screen-detail'

function LibraryPageInner() {
  const searchParams = useSearchParams()
  const platformProjectId = searchParams.get(paths.platformProjectQueryParam)?.trim() || null
  const [hashState, setHashState] = useState<LibraryHashState>({ view: 'screens' })
  const [screens, setScreens] = useState<LibraryScreen[]>([])
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
      setScreens(await fetchLibraryScreens(scope))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setScreens([])
    }

    try {
      setSections(await fetchLibrarySections({}))
    } catch {
      setSections([])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Collection scope drives refresh
  }, [platformProjectId])

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
        : 'screens'
  const screenDetailId =
    hashState.view === 'screen_detail' ? hashState.viewportCaptureId : null

  return (
    <AppShell
      title="Library"
      description="Browse captured screens, section look, DesignReferences, and multi-screen Flows."
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

      <div className="dig-mode-switch" role="tablist" aria-label="Library mode">
        {paths.libraryModes.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            className={`dig-mode-tab${mode === item ? ' is-active' : ''}`}
            onClick={() =>
              applyHash(
                item === 'flows'
                  ? { view: 'flows' }
                  : item === 'sections'
                    ? { view: 'sections' }
                    : { view: 'screens' },
              )
            }
          >
            {item === 'flows' ? paths.libraryCopy.flowsLabel : item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

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
          <Text role="title">Sections</Text>
          <Text role="meta">Measured section compositions across captures.</Text>
          <ul className="dig-list">
            {sections.map((section) => (
              <li key={`${section.capture_run_id}-${section.signature}-${section.viewport_name}`}>
                <strong>
                  {section.category} · `{section.signature}`
                </strong>
                <Text role="meta">
                  {section.viewport_name} · {(section.confidence * 100).toFixed(0)}% ·{' '}
                  {section.capture_run_id}
                </Text>
              </li>
            ))}
            {!sections.length ? <li>No sections indexed yet.</li> : null}
          </ul>
        </Panel>
      ) : null}

      {mode === 'screens' && screenDetailId ? (
        <LibraryScreenDetailPanel
          key={screenDetailId}
          viewportCaptureId={screenDetailId}
          platformProjectId={platformProjectId}
          onBack={() => applyHash({ view: 'screens' })}
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
                        const match = screens.find((s) => s.capture_run_id === hit.capture_run_id)
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
            <Text role="hint">Open a card for full-page screenshot, section overlay, and look accordion.</Text>
            <ul className="dig-screen-grid">
              {screens.map((screen) => {
                const thumb = islandMediaUrl(screen.primary_url)
                return (
                  <li key={screen.viewport_capture_id}>
                    <button
                      type="button"
                      className="dig-screen-card"
                      onClick={() => openScreen(screen)}
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
                    </button>
                  </li>
                )
              })}
              {!screens.length ? <li>No screens indexed yet.</li> : null}
            </ul>
          </Panel>
        </>
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
