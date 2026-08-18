import type { EnrichmentJob } from './dig-api'
import { paths } from './paths'
import type { JobSnapshot, JobStage } from './stages'

export type CaptureTally = Record<JobStage, number> & { total: number; open: number }

export type EnrichmentTally = {
  total: number
  queued: number
  running: number
  complete: number
  failed: number
  skipped: number
  open: number
}

const EMPTY_CAPTURE: CaptureTally = {
  queued: 0,
  capturing: 0,
  analyzing: 0,
  verifying: 0,
  indexing: 0,
  complete: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  open: 0,
}

export function jobHostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

export function tallyCaptureJobs(jobs: JobSnapshot[]): CaptureTally {
  const tally = { ...EMPTY_CAPTURE }
  for (const job of jobs) {
    tally.total += 1
    if (job.stage in tally) tally[job.stage] += 1
  }
  tally.open = tally.queued + tally.capturing + tally.analyzing + tally.verifying + tally.indexing
  return tally
}

export function tallyEnrichmentJobs(jobs: EnrichmentJob[]): EnrichmentTally {
  const tally: EnrichmentTally = {
    total: jobs.length,
    queued: 0,
    running: 0,
    complete: 0,
    failed: 0,
    skipped: 0,
    open: 0,
  }
  for (const job of jobs) {
    if (job.status === 'queued') tally.queued += 1
    else if (job.status === 'running') tally.running += 1
    else if (job.status === 'failed') tally.failed += 1
    else if (job.status === 'skipped') tally.skipped += 1
    else if (job.status === 'complete') tally.complete += 1
  }
  tally.open = tally.queued + tally.running
  return tally
}

export function queueHealthLevel(
  capture: CaptureTally,
  enrichment: EnrichmentTally,
): 'ok' | 'warn' | 'critical' {
  if (capture.failed > 20 || enrichment.failed > 10) return 'critical'
  if (capture.open > 0 || enrichment.open > 0 || capture.failed > 0) return 'warn'
  return 'ok'
}

export function queuedCaptureJobs(jobs: JobSnapshot[]): JobSnapshot[] {
  return jobs
    .filter((job) => job.stage === 'queued')
    .sort((left, right) => {
      const qi = (left.queue_index ?? Number.MAX_SAFE_INTEGER) - (right.queue_index ?? Number.MAX_SAFE_INTEGER)
      if (qi !== 0) return qi
      return left.created_at.localeCompare(right.created_at)
    })
}

export function liveCaptureJobs(jobs: JobSnapshot[]): JobSnapshot[] {
  return jobs
    .filter((job) => job.stage !== 'queued' && job.stage !== 'complete' && job.stage !== 'failed' && job.stage !== 'skipped')
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
}

export function captureSlotFill(capturing: number, maxConcurrent = paths.captureJobs.maxConcurrent): number {
  return pct(capturing, Math.max(1, maxConcurrent))
}

export function catalogFill(queued: number, maxBatch = 1000): number {
  return pct(queued, maxBatch)
}
