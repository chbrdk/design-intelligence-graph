'use client'

import { useRouter } from 'next/navigation'
import {
  Button,
  KpiStrip,
  PipelinePanel,
  RankedList,
  RankedRow,
  StatusMeterPanel,
  Text,
  TopStatus,
} from '../lib/msqdx-ui'
import type { EnrichmentJob } from '../lib/dig-api'
import { paths } from '../lib/paths'
import {
  captureSlotFill,
  catalogFill,
  jobHostLabel,
  liveCaptureJobs,
  pct,
  queueHealthLevel,
  tallyCaptureJobs,
  tallyEnrichmentJobs,
} from '../lib/queue-metrics'
import { stageLabel, type JobSnapshot } from '../lib/stages'

export function QueueDashboard({
  captureJobs,
  enrichmentJobs,
}: {
  captureJobs: JobSnapshot[]
  enrichmentJobs: EnrichmentJob[]
}) {
  const router = useRouter()
  const capture = tallyCaptureJobs(captureJobs)
  const enrich = tallyEnrichmentJobs(enrichmentJobs)
  const level = queueHealthLevel(capture, enrich)
  const live = liveCaptureJobs(captureJobs).slice(0, paths.islandSurfaces.homeLiveOpsCap)
  const runningEnrich = enrichmentJobs.filter((job) => job.status === 'running')
  const banner =
    capture.open || enrich.open
      ? `${capture.open} capturing · ${enrich.open} enriching`
      : 'Queue idle'
  const copy = paths.libraryCopy

  return (
    <>
      <StatusMeterPanel
        title={copy.queueHealth}
        meta={copy.dashboardLive}
        level={level}
        banner={banner}
        meters={[
          {
            id: 'waiting',
            label: copy.queueWaiting,
            value: String(capture.queued),
            fillPct: catalogFill(capture.queued),
            meta: `${capture.capturing} in detection`,
          },
          {
            id: 'slots',
            label: copy.queueSlots,
            value: `${capture.capturing}/${paths.captureJobs.maxConcurrent}`,
            fillPct: captureSlotFill(capture.capturing),
            meta: 'Playwright cap',
          },
          {
            id: 'enrich',
            label: copy.dashboardEnrich,
            value: String(enrich.open),
            fillPct: pct(enrich.open, Math.max(1, enrich.total)),
            meta: `${enrich.complete} done`,
          },
        ]}
      />
      <KpiStrip
        items={[
          {
            id: 'open',
            label: copy.queueWaiting,
            value: String(capture.queued),
            meta: 'URLs',
            onClick: () => router.push(paths.routes.queue),
          },
          {
            id: 'live',
            label: copy.queueLive,
            value: String(capture.capturing + enrich.running),
            meta: 'now',
          },
          {
            id: 'failed',
            label: copy.queueFailed,
            value: String(capture.failed + enrich.failed),
            meta: 'jobs',
          },
          {
            id: 'complete',
            label: copy.queueComplete,
            value: String(capture.complete),
            meta: 'indexed',
          },
        ]}
      />
      <PipelinePanel
        title={copy.queueCaptureLane}
        lanes={[
          { id: 'queued', label: 'Queued', value: String(capture.queued), fillPct: catalogFill(capture.queued), tone: 'rss' },
          {
            id: 'capturing',
            label: 'Detection',
            value: String(capture.capturing),
            fillPct: captureSlotFill(capture.capturing),
            tone: 'enrich',
            selected: capture.capturing > 0,
          },
          {
            id: 'complete',
            label: 'Indexed',
            value: String(capture.complete),
            fillPct: pct(capture.complete, Math.max(1, capture.total)),
            tone: 'embed',
          },
        ]}
        focusSlot={{
          label: copy.dashboardEnrich,
          value: enrich.running ? 'running' : enrich.queued ? 'queued' : 'idle',
          state: enrich.running ? 'active' : enrich.queued ? 'enrich' : 'idle',
          fillPct: pct(enrich.open, Math.max(1, enrich.total)),
          meta: `${enrich.queued} waiting`,
        }}
        operations={[
          ...live.map((job) => ({
            id: job.job_id,
            label: jobHostLabel(job.url),
            state: 'active' as const,
            live: true,
            detail: `${stageLabel(job.stage)} · ${job.message}`,
            fillPct: captureSlotFill(1),
            tone: 'enrich' as const,
          })),
          ...runningEnrich.map((job) => ({
            id: job.enrichment_job_id,
            label: job.capture_run_id,
            state: 'active' as const,
            live: true,
            detail: job.message,
            fillPct: 55,
            tone: 'ml' as const,
          })),
        ]}
      />
      {live.length ? (
        <RankedList hint={copy.queueLive}>
          {live.map((job, index) => (
            <RankedRow
              key={job.job_id}
              index={index + 1}
              label={jobHostLabel(job.url)}
              value={stageLabel(job.stage)}
              secondary={job.message}
              barPct={captureSlotFill(1)}
            />
          ))}
        </RankedList>
      ) : (
        <Text role="hint">{copy.queueEmpty}</Text>
      )}
      <div className="dig-row">
        <Button href={paths.routes.queue} variant="primary">
          {copy.queueOpen}
        </Button>
      </div>
    </>
  )
}

export function QueueTopStatus({
  captureJobs,
  enrichmentJobs,
}: {
  captureJobs: JobSnapshot[]
  enrichmentJobs: EnrichmentJob[]
}) {
  const capture = tallyCaptureJobs(captureJobs)
  const enrich = tallyEnrichmentJobs(enrichmentJobs)
  return (
    <TopStatus
      live={capture.open > 0 || enrich.open > 0}
      level={queueHealthLevel(capture, enrich)}
      primary={`${capture.open} in capture`}
      secondary={`${enrich.open} enriching`}
    />
  )
}
