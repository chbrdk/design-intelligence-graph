'use client'

import { useEffect, useState } from 'react'
import { Alert, Button, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchAnalyses,
  fetchAnalysisDetail,
  type LibraryAnalysisDetail,
  type LibraryAnalysisSummary,
} from '../lib/dig-api'
import { AppShell } from './app-shell'

export function AnalysesPageClient() {
  const [rows, setRows] = useState<LibraryAnalysisSummary[]>([])
  const [detail, setDetail] = useState<LibraryAnalysisDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      setRows(await fetchAnalyses())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setRows([])
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function open(id: string) {
    try {
      setError(null)
      setDetail(await fetchAnalysisDetail(id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setDetail(null)
    }
  }

  return (
    <AppShell title="Analyses" description="Indexed LLM design analyses for capture runs.">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="dig-split">
        <Panel className="dig-panel">
          <Button type="button" variant="subtle" onClick={() => void refresh()}>
            Refresh
          </Button>
          <ul className="dig-list">
            {rows.map((row) => (
              <li key={row.capture_run_id}>
                <button type="button" className="dig-linkish" onClick={() => void open(row.capture_run_id)}>
                  <strong>{row.status ?? 'unknown'}</strong>
                  <Text role="meta">{row.capture_run_id}</Text>
                  <Text role="body">{row.design_summary ?? '—'}</Text>
                </button>
              </li>
            ))}
            {!rows.length ? <li>No analyses yet.</li> : null}
          </ul>
        </Panel>
        <Panel className="dig-panel">
          <Text role="title">Detail</Text>
          {detail ? (
            <>
              <Text role="body">{detail.analysis.design_summary ?? 'No summary.'}</Text>
              <Text role="meta">
                {detail.analysis.model ?? '—'} · {detail.analysis.status ?? '—'}
              </Text>
              <ul className="dig-list">
                {detail.items.slice(0, 20).map((item) => (
                  <li key={item.id}>
                    {item.label ?? item.kind ?? item.id}
                    {item.interpretation ? ` — ${item.interpretation}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Text role="hint">Select an analysis.</Text>
          )}
        </Panel>
      </div>
    </AppShell>
  )
}
