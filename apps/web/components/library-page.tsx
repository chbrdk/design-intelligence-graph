'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, Button, Field, Input, Panel, Text } from '../lib/msqdx-ui'
import {
  assembleReferencePromptPack,
  fetchAnalysisDetail,
  fetchDesignReferences,
  fetchLibraryScreens,
  fetchLibrarySections,
  generateFromReferences,
  islandMediaUrl,
  searchLibrary,
  type DesignReferenceHit,
  type LibraryAnalysisDetail,
  type LibraryScreen,
  type LibrarySearchHit,
  type LibrarySection,
} from '../lib/dig-api'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'

function LibraryPageInner() {
  const searchParams = useSearchParams()
  const platformProjectId = searchParams.get(paths.platformProjectQueryParam)?.trim() || null
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [sections, setSections] = useState<LibrarySection[]>([])
  const [references, setReferences] = useState<DesignReferenceHit[]>([])
  const [category, setCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [similarTo, setSimilarTo] = useState('')
  const [searchHits, setSearchHits] = useState<LibrarySearchHit[]>([])
  const [selected, setSelected] = useState<LibraryScreen | null>(null)
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [intent, setIntent] = useState('hero marketing section')
  const [packPreview, setPackPreview] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<LibraryAnalysisDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(nextCategory = category) {
    try {
      setError(null)
      const scope = { platformProjectId }
      const [nextScreens, nextSections, nextRefs] = await Promise.all([
        fetchLibraryScreens(scope),
        fetchLibrarySections(nextCategory ? { category: nextCategory, ...scope } : scope),
        fetchDesignReferences({ ...scope, limit: 40 }),
      ])
      setScreens(nextScreens)
      setSections(nextSections)
      setReferences(nextRefs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setScreens([])
      setSections([])
      setReferences([])
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Collection scope drives refresh
  }, [platformProjectId])

  async function openScreen(screen: LibraryScreen) {
    setSelected(screen)
    try {
      setAnalysis(await fetchAnalysisDetail(screen.capture_run_id))
    } catch {
      setAnalysis(null)
    }
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

  const selectedMedia = islandMediaUrl(selected?.primary_url)
  const sectionLooks = analysis?.section_look ?? []
  const screenSections = sections.filter((s) =>
    selected ? s.capture_run_id === selected.capture_run_id : true,
  )

  return (
    <AppShell
      title="Library"
      description="Browse captured screens, section look, DesignReferences, and assemble packs."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {platformProjectId ? (
        <Text role="meta">
          Collection: <code>{platformProjectId}</code>
        </Text>
      ) : null}

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
          <Field label="Section category">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => void refresh(category)}
            />
          </Field>
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
                    if (match) void openScreen(match)
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
                  {typeof ref.similarity === 'number' ? ` · sim ${(ref.similarity * 100).toFixed(0)}%` : ''}
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

      <div className="dig-split">
        <Panel className="dig-panel">
          <Text role="title">Screens</Text>
          <ul className="dig-screen-grid">
            {screens.map((screen) => {
              const thumb = islandMediaUrl(screen.primary_url)
              return (
                <li key={screen.viewport_capture_id}>
                  <button
                    type="button"
                    className={`dig-screen-card${selected?.viewport_capture_id === screen.viewport_capture_id ? ' is-active' : ''}`}
                    onClick={() => void openScreen(screen)}
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

        <Panel className="dig-panel">
          <Text role="title">Detail</Text>
          {selected ? (
            <>
              {selectedMedia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedMedia}
                  alt={selected.title || selected.name}
                  className="dig-screen-hero"
                />
              ) : (
                <Text role="hint">No screenshot path on this viewport.</Text>
              )}
              <Text role="headline">{selected.title || selected.name}</Text>
              <Text role="meta">{selected.canonical_url}</Text>
              <Text role="body">{analysis?.analysis.design_summary ?? 'No analysis summary yet.'}</Text>
              {analysis?.package?.vision?.status ? (
                <Text role="meta">Vision: {analysis.package.vision.status}</Text>
              ) : null}
            </>
          ) : (
            <Text role="hint">Select a screen.</Text>
          )}

          <Text role="title">Section look</Text>
          <ul className="dig-list">
            {sectionLooks.map((section) => (
              <li key={section.id ?? `${section.name}-${section.signature}`}>
                <strong>
                  {section.category ?? 'section'} · {section.signature ?? section.name}
                </strong>
                <Text role="body">{section.interpretation ?? '—'}</Text>
                {typeof section.confidence === 'number' ? (
                  <Text role="meta">{(section.confidence * 100).toFixed(0)}% confidence</Text>
                ) : null}
              </li>
            ))}
            {selected && !sectionLooks.length ? (
              <li>
                <Text role="hint">
                  No section_look yet for this capture (sparse pages fall back to screen-level
                  DesignReference only).
                </Text>
              </li>
            ) : null}
          </ul>

          <Text role="title">Ontology sections</Text>
          <ul className="dig-list">
            {screenSections.slice(0, 40).map((section) => (
              <li key={`${section.capture_run_id}-${section.taxonomy_id}`}>
                {section.category} · {section.signature}{' '}
                <Text role="meta">{(section.confidence * 100).toFixed(0)}%</Text>
              </li>
            ))}
            {!screenSections.length ? <li>No ontology sections indexed.</li> : null}
          </ul>
        </Panel>
      </div>
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
