'use client'

import { useEffect, useState } from 'react'
import { Alert, Button, Field, Input, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchAnalysisDetail,
  fetchLibraryScreens,
  fetchLibrarySections,
  searchLibrary,
  type LibraryAnalysisDetail,
  type LibraryScreen,
  type LibrarySearchHit,
  type LibrarySection,
} from '../lib/dig-api'
import { AppShell } from './app-shell'

export function LibraryPageClient() {
  const [screens, setScreens] = useState<LibraryScreen[]>([])
  const [sections, setSections] = useState<LibrarySection[]>([])
  const [category, setCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<LibrarySearchHit[]>([])
  const [selected, setSelected] = useState<LibraryScreen | null>(null)
  const [analysis, setAnalysis] = useState<LibraryAnalysisDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(nextCategory = category) {
    try {
      setError(null)
      const [nextScreens, nextSections] = await Promise.all([
        fetchLibraryScreens(),
        fetchLibrarySections(nextCategory ? { category: nextCategory } : undefined),
      ])
      setScreens(nextScreens)
      setSections(nextSections)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setScreens([])
      setSections([])
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

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
      setSearchHits(await searchLibrary(q))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setSearchHits([])
    }
  }

  return (
    <AppShell
      title="Library"
      description="Browse captured screens, section recipes, and search the design index."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Panel className="dig-panel">
        <div className="dig-row">
          <Field label="Search">
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </Field>
          <Button type="button" variant="subtle" onClick={() => void onSearch()}>
            Search
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

      <div className="dig-split">
        <Panel className="dig-panel">
          <Text role="title">Screens</Text>
          <ul className="dig-list">
            {screens.map((screen) => (
              <li key={screen.viewport_capture_id}>
                <button type="button" className="dig-linkish" onClick={() => void openScreen(screen)}>
                  <strong>{screen.title || screen.name}</strong>
                  <Text role="meta">{screen.site_domain ?? screen.canonical_url}</Text>
                </button>
              </li>
            ))}
            {!screens.length ? <li>No screens indexed yet.</li> : null}
          </ul>
        </Panel>

        <Panel className="dig-panel">
          <Text role="title">Detail</Text>
          {selected ? (
            <>
              <Text role="headline">{selected.title || selected.name}</Text>
              <Text role="meta">{selected.canonical_url}</Text>
              <Text role="body">{analysis?.analysis.design_summary ?? 'No analysis summary yet.'}</Text>
            </>
          ) : (
            <Text role="hint">Select a screen.</Text>
          )}
          <Text role="title">Sections</Text>
          <ul className="dig-list">
            {sections.slice(0, 40).map((section) => (
              <li key={`${section.capture_run_id}-${section.taxonomy_id}`}>
                {section.category} · {section.signature}{' '}
                <Text role="meta">{(section.confidence * 100).toFixed(0)}%</Text>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  )
}
