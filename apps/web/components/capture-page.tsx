'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Alert, Button, Field, Input, Panel, Text, TopStatus } from '../lib/msqdx-ui'
import {
  fetchEnrichmentJobs,
  fetchJob,
  startJob,
  subscribeJobEvents,
  type EnrichmentJob,
} from '../lib/dig-api'
import { paths } from '../lib/paths'
import { STAGE_ORDER, stageLabel, stagePhase, type JobEvent, type JobSnapshot, type JobStage } from '../lib/stages'
import { AppShell } from './app-shell'

const ACTIVE: JobStage[] = ['queued', 'capturing', 'analyzing', 'verifying', 'indexing']

function CaptureBody() {
  const search = useSearchParams()
  const platformProjectId = search.get(paths.platformProjectQueryParam)?.trim() || null
  const [url, setUrl] = useState('https://example.com')
  const [job, setJob] = useState<JobSnapshot | null>(null)
  const [events, setEvents] = useState<JobEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [enrichmentJobs, setEnrichmentJobs] = useState<EnrichmentJob[]>([])

  useEffect(() => {
    if (!job || !ACTIVE.includes(job.stage)) return
    return subscribeJobEvents(job.job_id, (event) => {
      setEvents((prev) => {
        if (prev.some((item) => item.at === event.at && item.stage === event.stage && item.message === event.message)) {
          return prev
        }
        return [...prev, event]
      })
      setJob((prev) =>
        prev
          ? {
              ...prev,
              stage: event.stage,
              message: event.message,
              updated_at: event.at,
              ...(event.result ? { result: event.result } : {}),
              ...(event.error ? { error: event.error } : {}),
            }
          : prev,
      )
    })
  }, [job?.job_id, job?.stage])

  useEffect(() => {
    if (!job?.result?.enrichment_job_id) return
    const tick = () => {
      void fetchEnrichmentJobs()
        .then(setEnrichmentJobs)
        .catch(() => setEnrichmentJobs([]))
    }
    tick()
    const handle = window.setInterval(tick, 2500)
    return () => window.clearInterval(handle)
  }, [job?.result?.enrichment_job_id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    setEvents([])
    try {
      const created = await startJob(url, { platformProjectId })
      setJob(await fetchJob(created.job_id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setJob(null)
    } finally {
      setSubmitting(false)
    }
  }

  const phase = job ? stagePhase(job.stage) : 'idle'
  const liveEnrichment =
    job?.result?.enrichment_job_id != null
      ? enrichmentJobs.find((item) => item.enrichment_job_id === job.result?.enrichment_job_id)
      : undefined

  const statusLevel =
    phase === 'error' ? 'critical' : phase === 'done' ? 'ok' : phase === 'idle' ? 'ok' : 'warn'

  return (
    <AppShell
      title="Capture"
      description="Enter a public URL. DIG measures viewports, derives section recipes, and indexes a browsable library."
      status={
        <TopStatus
          level={statusLevel}
          primary={job ? stageLabel(job.stage) : 'Idle'}
          live={Boolean(job && ACTIVE.includes(job.stage))}
        />
      }
    >
      <Panel className="dig-panel">
        {platformProjectId ? (
          <Text role="meta">
            Collection: <code>{platformProjectId}</code>
          </Text>
        ) : null}
        <form className="dig-stack" onSubmit={onSubmit}>
          <Field label="Target URL">
            <Input
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || (job !== null && ACTIVE.includes(job.stage))}
          >
            {submitting ? 'Starting…' : job && ACTIVE.includes(job.stage) ? 'Running…' : 'Run capture'}
          </Button>
        </form>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </Panel>

      <Panel className="dig-panel" aria-live="polite">
        <Text role="title">Pipeline status</Text>
        <Text role="meta">{job?.job_id ?? 'Idle'}</Text>
        <ol className="dig-timeline">
          {STAGE_ORDER.map((stage) => {
            const idx = STAGE_ORDER.indexOf(stage)
            const currentIndex = job
              ? STAGE_ORDER.indexOf(job.stage === 'failed' ? 'queued' : job.stage)
              : -1
            const done = currentIndex > idx || job?.stage === 'complete'
            const active = currentIndex === idx && job?.stage !== 'complete'
            return (
              <li key={stage} className={done ? 'done' : active ? 'active' : ''}>
                {stageLabel(stage)}
              </li>
            )
          })}
        </ol>
        {job?.message ? <Text role="body">{job.message}</Text> : null}
        {liveEnrichment ? (
          <Text role="meta">
            Enrichment {liveEnrichment.status}: {liveEnrichment.message}
          </Text>
        ) : null}
        {events.length ? (
          <ul className="dig-event-list">
            {events.slice(-8).map((event) => (
              <li key={`${event.at}-${event.stage}-${event.message}`}>
                <strong>{stageLabel(event.stage)}</strong> — {event.message}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </AppShell>
  )
}

export function CapturePageClient() {
  return (
    <Suspense fallback={<AppShell title="Capture"><Panel className="dig-panel">Loading…</Panel></AppShell>}>
      <CaptureBody />
    </Suspense>
  )
}
