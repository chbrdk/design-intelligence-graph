export type JobStage =
  | 'queued'
  | 'capturing'
  | 'analyzing'
  | 'verifying'
  | 'indexing'
  | 'complete'
  | 'failed'
  | 'skipped'

export interface JobResult {
  package_root?: string
  index_root?: string
  capture_run_id?: string
  capture_status?: string
  nodes?: number
  edges?: number
  checked_artifacts?: number
  llm_status?: string
  llm_hypothesis_count?: number
  design_summary?: string
  enrichment_job_id?: string
  enrichment_status?: string
}

export interface JobEvent {
  job_id: string
  stage: JobStage
  message: string
  at: string
  progress?: { current: number; total: number; label?: string }
  result?: JobResult
  error?: string
}

export interface JobSnapshot {
  job_id: string
  url: string
  stage: JobStage
  message: string
  created_at: string
  updated_at: string
  event_count: number
  result?: JobResult
  error?: string
  ingest_source?: string
  queue_index?: number | null
  latest_event?: JobEvent
}

export const STAGE_ORDER: JobStage[] = [
  'queued',
  'capturing',
  'analyzing',
  'verifying',
  'indexing',
  'complete',
]

export function stageLabel(stage: JobStage): string {
  switch (stage) {
    case 'queued':
      return 'Queued'
    case 'capturing':
      return 'Detection'
    case 'analyzing':
      return 'Design AI'
    case 'verifying':
      return 'Verify'
    case 'indexing':
      return 'Ingestion'
    case 'complete':
      return 'Complete'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
  }
}

export function stagePhase(
  stage: JobStage,
): 'detection' | 'analysis' | 'ingestion' | 'done' | 'error' | 'idle' {
  if (stage === 'queued' || stage === 'capturing') return 'detection'
  if (stage === 'analyzing') return 'analysis'
  if (stage === 'verifying' || stage === 'indexing') return 'ingestion'
  if (stage === 'complete') return 'done'
  if (stage === 'failed') return 'error'
  if (stage === 'skipped') return 'idle'
  return 'idle'
}
