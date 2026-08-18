'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  FilterRow,
  Panel,
  SectionChrome,
  Text,
  ToggleGroup,
} from '../lib/msqdx-ui'
import { DataTable, LayersPanel } from '../lib/msqdx-ui-client'
import {
  fetchCaptureJobs,
  fetchEnrichmentJobs,
  moveCaptureJob,
  skipCaptureJob,
  skipEnrichmentJob,
  type EnrichmentJob,
} from '../lib/dig-api'
import { paths } from '../lib/paths'
import {
  jobHostLabel,
  queuedCaptureJobs,
  tallyCaptureJobs,
  tallyEnrichmentJobs,
} from '../lib/queue-metrics'
import { stageLabel, type JobSnapshot } from '../lib/stages'
import { AppShell } from './app-shell'
import { QueueDashboard, QueueTopStatus } from './queue-dashboard'

type Lane = 'capture' | 'enrichment'
type CaptureFilter = 'queued' | 'live' | 'failed' | 'complete' | 'all'

export function QueuePageClient() {
  const [captureJobs, setCaptureJobs] = useState<JobSnapshot[]>([])
  const [enrichmentJobs, setEnrichmentJobs] = useState<EnrichmentJob[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [editsLive, setEditsLive] = useState(true)
  const [lane, setLane] = useState<Lane>('capture')
  const [filter, setFilter] = useState<CaptureFilter>('queued')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function refresh() {
    try {
      setError(null)
      const [jobs, enrich] = await Promise.all([fetchCaptureJobs(), fetchEnrichmentJobs()])
      setCaptureJobs(jobs)
      setEnrichmentJobs(enrich)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void refresh()
    const handle = window.setInterval(() => void refresh(), paths.islandSurfaces.queuePollMs)
    return () => window.clearInterval(handle)
  }, [])

  const queued = queuedCaptureJobs(captureJobs)
  const head = queued.slice(0, paths.islandSurfaces.queueEditHeadCap)
  const captureTally = tallyCaptureJobs(captureJobs)
  const enrichTally = tallyEnrichmentJobs(enrichmentJobs)

  const captureRows = useMemo(() => {
    if (filter === 'queued') return queued
    if (filter === 'live') {
      return captureJobs.filter(
        (job) => !['queued', 'complete', 'failed', 'skipped'].includes(job.stage),
      )
    }
    if (filter === 'failed') return captureJobs.filter((job) => job.stage === 'failed')
    if (filter === 'complete') return captureJobs.filter((job) => job.stage === 'complete')
    return captureJobs
  }, [captureJobs, filter, queued])

  async function runEdit(work: () => Promise<unknown>) {
    try {
      setEditError(null)
      await work()
      await refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (/404|405|Not found|Skip failed \(404\)|Reorder failed \(404\)/i.test(message)) {
        setEditsLive(false)
        setEditError(paths.libraryCopy.queueEditsNeedApi)
        return
      }
      setEditError(message)
    }
  }

  return (
    <AppShell
      title={paths.libraryCopy.queueTitle}
      description={paths.libraryCopy.queueHint}
      status={<QueueTopStatus captureJobs={captureJobs} enrichmentJobs={enrichmentJobs} />}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {editError ? <Alert tone="info">{editError}</Alert> : null}

      <QueueDashboard captureJobs={captureJobs} enrichmentJobs={enrichmentJobs} />

      <Panel className="dig-panel">
        <ToggleGroup
          aria-label="Queue lane"
          value={lane}
          onChange={(value) => setLane(value as Lane)}
          options={[
            { value: 'capture', label: `${paths.libraryCopy.queueCaptureLane} ${captureTally.open}` },
            { value: 'enrichment', label: `${paths.libraryCopy.queueEnrichLane} ${enrichTally.open}` },
          ]}
        />

        {lane === 'capture' ? (
          <>
            <FilterRow label="Stage" variant="toolbar">
              {(
                [
                  ['queued', `Waiting ${captureTally.queued}`],
                  ['live', `Live ${captureTally.capturing}`],
                  ['failed', `Failed ${captureTally.failed}`],
                  ['complete', `Done ${captureTally.complete}`],
                  ['all', `All ${captureTally.total}`],
                ] as const
              ).map(([id, label]) => (
                <Chip key={id} size="sm" selected={filter === id} onClick={() => setFilter(id)}>
                  {label}
                </Chip>
              ))}
            </FilterRow>

            {filter === 'queued' && head.length ? (
              <>
                <SectionChrome title="Next up" meta={`${head.length} editable`} as="h2" quiet />
                <LayersPanel
                  items={head.map((job) => ({
                    id: job.job_id,
                    label: jobHostLabel(job.url),
                    type: job.url,
                  }))}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMoveUp={(id) => void runEdit(() => moveCaptureJob(id, 'up'))}
                  onMoveDown={(id) => void runEdit(() => moveCaptureJob(id, 'down'))}
                />
                <div className="dig-row">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!editsLive || !selectedId}
                    onClick={() => selectedId && void runEdit(() => moveCaptureJob(selectedId, 'front'))}
                  >
                    {paths.libraryCopy.queueFront}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={!editsLive || !selectedId}
                    onClick={() => selectedId && void runEdit(() => skipCaptureJob(selectedId))}
                  >
                    {paths.libraryCopy.queueSkip}
                  </Button>
                </div>
              </>
            ) : null}

            <DataTable
              caption={paths.libraryCopy.queueCaptureLane}
              getRowId={(row) => row.job_id}
              rows={captureRows}
              empty={<Text role="hint">{paths.libraryCopy.queueEmpty}</Text>}
              columns={[
                {
                  id: 'host',
                  header: 'Host',
                  sortValue: (row) => jobHostLabel(row.url),
                  cell: (row) => jobHostLabel(row.url),
                },
                {
                  id: 'stage',
                  header: 'Stage',
                  sortValue: (row) => row.stage,
                  cell: (row) => stageLabel(row.stage),
                },
                {
                  id: 'message',
                  header: 'Status',
                  cell: (row) => row.message,
                },
                {
                  id: 'edit',
                  header: '',
                  cell: (row) =>
                    row.stage === 'queued' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!editsLive}
                        onClick={() => void runEdit(() => skipCaptureJob(row.job_id))}
                      >
                        {paths.libraryCopy.queueSkip}
                      </Button>
                    ) : null,
                },
              ]}
            />
          </>
        ) : (
          <DataTable
            caption={paths.libraryCopy.queueEnrichLane}
            getRowId={(row) => row.enrichment_job_id}
            rows={enrichmentJobs}
            empty={<Text role="hint">{paths.libraryCopy.enrichmentEmpty}</Text>}
            columns={[
              {
                id: 'status',
                header: 'Status',
                sortValue: (row) => row.status,
                cell: (row) => row.status,
              },
              {
                id: 'capture',
                header: 'Capture',
                sortValue: (row) => row.capture_run_id,
                cell: (row) => row.capture_run_id,
              },
              {
                id: 'message',
                header: 'Status',
                cell: (row) => row.design_summary || row.message,
              },
              {
                id: 'edit',
                header: '',
                cell: (row) =>
                  row.status === 'queued' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!editsLive}
                      onClick={() => void runEdit(() => skipEnrichmentJob(row.enrichment_job_id))}
                    >
                      {paths.libraryCopy.queueSkip}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Panel>
    </AppShell>
  )
}
