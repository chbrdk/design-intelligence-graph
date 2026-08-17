import { randomUUID } from "node:crypto";
import { capture } from "./capture.js";
import { attachCheckionScreenshotIfConfigured } from "./checkion-attach.js";
import { CANONICAL_VIEWPORTS } from "./config.js";
import { asyncEnrichmentEnabled, type EnrichmentQueue } from "./enrichment-queue.js";
import { applyLlmDesignAnalysis } from "./llm-enrich.js";
import { localLlmConfig } from "./llm-provider.js";
import { captureNavConfig, inferCaptureLocale } from "./capture-nav.js";
import { captureJobsConfig } from "./capture-catalog.js";
import { capturesDirectory, indexesDirectory } from "./runtime-paths.js";
import { indexCapturePackage } from "./storage.js";
import { indexCapturePackageToDatabase } from "./db-index.js";
import { verifyCapturePackage } from "./verify.js";

export type JobStage = "queued" | "capturing" | "analyzing" | "verifying" | "indexing" | "complete" | "failed";

export interface JobResult {
  package_root?: string;
  index_root?: string;
  capture_run_id?: string;
  capture_status?: string;
  nodes?: number;
  edges?: number;
  checked_artifacts?: number;
  llm_status?: string;
  llm_hypothesis_count?: number;
  design_summary?: string;
  enrichment_job_id?: string;
  enrichment_status?: string;
}

export interface JobEvent {
  job_id: string;
  stage: JobStage;
  message: string;
  at: string;
  progress?: { current: number; total: number; label?: string };
  result?: JobResult;
  error?: string;
}

export interface JobRecord {
  job_id: string;
  url: string;
  stage: JobStage;
  message: string;
  created_at: string;
  updated_at: string;
  events: JobEvent[];
  result?: JobResult;
  error?: string;
  /** Plexon Collection id when capture is scoped. */
  platform_project_id?: string | null;
  /** Local dig_projects.id when known. */
  dig_project_id?: string | null;
}

export type StartJobOptions = {
  platformProjectId?: string | null;
  digProjectId?: string | null;
};

export interface JobRunnerOptions {
  capturesDir?: string;
  indexesDir?: string;
  timeoutMs?: number;
  settleMs?: number;
  now?: () => Date;
  captureFn?: typeof capture;
  analyzeFn?: typeof applyLlmDesignAnalysis;
  verifyFn?: typeof verifyCapturePackage;
  indexFn?: typeof indexCapturePackage;
  enrichmentQueue?: EnrichmentQueue;
  /** When true (default if DIG_LLM_ASYNC), enqueue enrichment instead of blocking. */
  asyncEnrichment?: boolean;
  /** How many Playwright captures may run at once (Coolify: 1). */
  maxConcurrent?: number;
}

const DETECTION_STAGES: JobStage[] = ["queued", "capturing", "analyzing"];
const INGESTION_STAGES: JobStage[] = ["verifying", "indexing"];

export function isDetectionStage(stage: JobStage): boolean {
  return DETECTION_STAGES.includes(stage);
}

export function isIngestionStage(stage: JobStage): boolean {
  return INGESTION_STAGES.includes(stage);
}

export function normalizeCaptureUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  if (!parsed.hostname) throw new Error("URL hostname is required.");
  return parsed.toString();
}

export function createJobId(now = () => new Date()): string {
  return `job_${now().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

type Listener = (event: JobEvent, job: JobRecord) => void;

export class JobRunner {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly options: Required<Pick<JobRunnerOptions, "timeoutMs" | "settleMs">> & JobRunnerOptions;
  private readonly pending: string[] = [];
  private running = 0;

  constructor(options: JobRunnerOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? captureNavConfig().jobTimeoutMs,
      settleMs: options.settleMs ?? 500,
      maxConcurrent: options.maxConcurrent ?? captureJobsConfig().maxConcurrent,
      ...options
    };
  }

  listJobs(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getJob(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  subscribe(jobId: string, listener: Listener): () => void {
    const set = this.listeners.get(jobId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(jobId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }

  startJob(rawUrl: string, options: StartJobOptions = {}): JobRecord {
    const url = normalizeCaptureUrl(rawUrl);
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const platformProjectId = options.platformProjectId?.trim() || null;
    const digProjectId = options.digProjectId?.trim() || null;
    const job: JobRecord = {
      job_id: createJobId(this.options.now),
      url,
      stage: "queued",
      message: "Job queued",
      created_at: now,
      updated_at: now,
      events: [],
      ...(platformProjectId ? { platform_project_id: platformProjectId } : {}),
      ...(digProjectId ? { dig_project_id: digProjectId } : {})
    };
    this.jobs.set(job.job_id, job);
    this.emit(job, { stage: "queued", message: "Waiting to start detection" });
    this.pending.push(job.job_id);
    this.pump();
    return job;
  }

  startJobs(rawUrls: string[], options: StartJobOptions = {}): JobRecord[] {
    return rawUrls.map((rawUrl) => this.startJob(rawUrl, options));
  }

  private maxConcurrent(): number {
    return Math.max(1, this.options.maxConcurrent ?? 1);
  }

  private pump(): void {
    const cap = this.maxConcurrent();
    while (this.running < cap && this.pending.length) {
      const jobId = this.pending.shift();
      if (!jobId) break;
      this.running += 1;
      void this.run(jobId).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  private emit(job: JobRecord, partial: Omit<JobEvent, "job_id" | "at"> & { at?: string }): JobEvent {
    const event: JobEvent = {
      job_id: job.job_id,
      stage: partial.stage,
      message: partial.message,
      at: partial.at ?? (this.options.now ?? (() => new Date()))().toISOString(),
      ...(partial.progress ? { progress: partial.progress } : {}),
      ...(partial.result ? { result: partial.result } : {}),
      ...(partial.error ? { error: partial.error } : {})
    };
    job.stage = event.stage;
    job.message = event.message;
    job.updated_at = event.at;
    if (event.result) job.result = event.result;
    if (event.error) job.error = event.error;
    job.events.push(event);
    for (const listener of this.listeners.get(job.job_id) ?? []) listener(event, job);
    return event;
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const captureFn = this.options.captureFn ?? capture;
    const verifyFn = this.options.verifyFn ?? verifyCapturePackage;
    const indexFn = this.options.indexFn ?? indexCapturePackage;
    const capturesDir = this.options.capturesDir ?? capturesDirectory();
    const indexesDir = this.options.indexesDir ?? indexesDirectory();

    try {
      this.emit(job, {
        stage: "capturing",
        message: `Detecting layout evidence across ${CANONICAL_VIEWPORTS.length} viewports`,
        progress: { current: 0, total: CANONICAL_VIEWPORTS.length, label: "viewports" }
      });
      const captureResult = await captureFn({
        url: job.url,
        outputDirectory: capturesDir,
        viewports: CANONICAL_VIEWPORTS,
        timeoutMs: this.options.timeoutMs,
        settleMs: this.options.settleMs,
        locale: inferCaptureLocale(job.url, "Europe/Berlin"),
        timezoneId: "Europe/Berlin",
        colorScheme: "light",
        reducedMotion: "no-preference",
        headed: false
      });
      this.emit(job, {
        stage: "capturing",
        message: `Detection ${captureResult.manifest.status}`,
        progress: {
          current: captureResult.manifest.viewport_captures.length,
          total: CANONICAL_VIEWPORTS.length,
          label: "viewports"
        },
        result: {
          package_root: captureResult.packageRoot,
          capture_run_id: captureResult.manifest.capture_run_id,
          capture_status: captureResult.manifest.status
        }
      });

      this.emit(job, {
        stage: "capturing",
        message: "Capturing full-page screenshot via CHECKION"
      });
      let checkion: Awaited<ReturnType<typeof attachCheckionScreenshotIfConfigured>>;
      try {
        checkion = await attachCheckionScreenshotIfConfigured(captureResult.packageRoot, job.url);
      } catch (checkionError: unknown) {
        checkion = {
          attached: false,
          skipped: checkionError instanceof Error ? checkionError.message : String(checkionError)
        };
      }
      if (checkion.attached) {
        this.emit(job, {
          stage: "capturing",
          message: `CHECKION full-page attached (${checkion.width ?? "?"}×${checkion.height ?? "?"} JPEG)`,
          result: {
            package_root: captureResult.packageRoot,
            capture_run_id: captureResult.manifest.capture_run_id,
            capture_status: captureResult.manifest.status
          }
        });
      } else if (checkion.skipped) {
        this.emit(job, {
          stage: "capturing",
          message: `CHECKION screenshot skipped: ${checkion.skipped}`,
          result: {
            package_root: captureResult.packageRoot,
            capture_run_id: captureResult.manifest.capture_run_id,
            capture_status: captureResult.manifest.status
          }
        });
      }

      if (captureResult.manifest.status === "failed") {
        throw new Error(captureResult.manifest.errors.map((item) => item.message).join("; ") || "Capture failed");
      }
      if (captureResult.manifest.status === "blocked" && !checkion.attached) {
        throw new Error("Capture blocked by site access control (WAF / Access Denied)");
      }

      const llmConfig = localLlmConfig();
      let llmStatus = "skipped";
      let llmHypothesisCount = 0;
      let designSummary: string | undefined;
      let enrichmentJobId: string | undefined;
      let enrichmentStatus: string | undefined;
      const useAsync =
        this.options.asyncEnrichment ?? asyncEnrichmentEnabled(process.env, llmConfig.enabled);

      if (captureResult.manifest.status === "blocked") {
        llmStatus = "skipped";
        this.emit(job, {
          stage: "analyzing",
          message: "LLM skipped — DIG capture was access-blocked; CHECKION screenshot attached"
        });
      } else if (llmConfig.enabled && useAsync && this.options.enrichmentQueue) {
        const enqueued = this.options.enrichmentQueue.enqueue({
          package_path: captureResult.packageRoot,
          capture_run_id: captureResult.manifest.capture_run_id,
          capture_job_id: job.job_id
        });
        enrichmentJobId = enqueued.enrichment_job_id;
        enrichmentStatus = enqueued.status;
        llmStatus = "queued";
        this.emit(job, {
          stage: "analyzing",
          message: `LLM enrichment queued (${enqueued.enrichment_job_id})`,
          result: {
            package_root: captureResult.packageRoot,
            capture_run_id: captureResult.manifest.capture_run_id,
            capture_status: captureResult.manifest.status,
            llm_status: llmStatus,
            enrichment_job_id: enrichmentJobId,
            enrichment_status: enrichmentStatus ?? "queued"
          }
        });
      } else if (llmConfig.enabled) {
        this.emit(job, { stage: "analyzing", message: `Analyzing design with ${llmConfig.model}` });
        const analyzeFn = this.options.analyzeFn ?? applyLlmDesignAnalysis;
        const enrichment = await analyzeFn(captureResult.packageRoot);
        llmStatus = enrichment.llm.status;
        llmHypothesisCount = enrichment.llm.hypotheses.length;
        if (enrichment.llm.design_summary) designSummary = enrichment.llm.design_summary;
        if (enrichment.llm.status === "failed") {
          const failedEvent: Omit<JobEvent, "job_id" | "at"> = {
            stage: "analyzing",
            message: "LLM analysis failed; continuing with deterministic evidence",
            result: {
              package_root: captureResult.packageRoot,
              capture_run_id: captureResult.manifest.capture_run_id,
              capture_status: captureResult.manifest.status,
              llm_status: llmStatus
            }
          };
          if (enrichment.llm.error) failedEvent.error = enrichment.llm.error;
          this.emit(job, failedEvent);
        } else {
          this.emit(job, {
            stage: "analyzing",
            message: enrichment.updated
              ? `Design analysis complete (${llmHypothesisCount} hypotheses)`
              : "LLM analysis skipped",
            result: {
              package_root: captureResult.packageRoot,
              capture_run_id: captureResult.manifest.capture_run_id,
              capture_status: captureResult.manifest.status,
              llm_status: llmStatus,
              llm_hypothesis_count: llmHypothesisCount,
              ...(designSummary ? { design_summary: designSummary } : {})
            }
          });
        }
      }

      this.emit(job, { stage: "verifying", message: "Verifying capture package integrity" });
      const verification = await verifyFn(captureResult.packageRoot);
      if (!verification.valid) {
        throw new Error(formatJobIssueList(verification.issues));
      }
      this.emit(job, {
        stage: "verifying",
        message: `Verified ${verification.checked_artifacts} artifacts`,
        result: {
          package_root: captureResult.packageRoot,
          capture_run_id: captureResult.manifest.capture_run_id,
          capture_status: captureResult.manifest.status,
          checked_artifacts: verification.checked_artifacts,
          llm_status: llmStatus,
          llm_hypothesis_count: llmHypothesisCount,
          ...(enrichmentJobId
            ? { enrichment_job_id: enrichmentJobId, enrichment_status: enrichmentStatus ?? "queued" }
            : {}),
          ...(designSummary ? { design_summary: designSummary } : {})
        }
      });

      this.emit(job, { stage: "indexing", message: "Ingesting into portable knowledge graph" });
      const indexed = await indexFn(captureResult.packageRoot, indexesDir);
      try {
        const dbIndex = await indexCapturePackageToDatabase(captureResult.packageRoot, undefined, {
          platformProjectId: job.platform_project_id ?? null,
          digProjectId: job.dig_project_id ?? null
        });
        if (dbIndex.indexed) {
          this.emit(job, {
            stage: "indexing",
            message: "Indexed graph + Postgres library metadata",
            result: {
              package_root: captureResult.packageRoot,
              index_root: indexed.indexRoot,
              capture_run_id: captureResult.manifest.capture_run_id,
              capture_status: captureResult.manifest.status,
              nodes: indexed.graph.nodes.length,
              edges: indexed.graph.edges.length,
              checked_artifacts: verification.checked_artifacts,
              llm_status: llmStatus,
              llm_hypothesis_count: llmHypothesisCount,
              ...(enrichmentJobId
                ? { enrichment_job_id: enrichmentJobId, enrichment_status: enrichmentStatus ?? "queued" }
                : {}),
              ...(designSummary ? { design_summary: designSummary } : {})
            }
          });
        }
      } catch (dbError: unknown) {
        this.emit(job, {
          stage: "indexing",
          message: "Graph indexed; Postgres library ingest skipped",
          error: dbError instanceof Error ? dbError.message : String(dbError),
          result: {
            package_root: captureResult.packageRoot,
            index_root: indexed.indexRoot,
            capture_run_id: captureResult.manifest.capture_run_id,
            nodes: indexed.graph.nodes.length,
            edges: indexed.graph.edges.length
          }
        });
      }
      this.emit(job, {
        stage: "complete",
        message: enrichmentJobId
          ? "Detection and ingestion complete; LLM enrichment running async"
          : designSummary
            ? "Detection, design analysis, and ingestion complete"
            : "Detection and ingestion complete",
        result: {
          package_root: captureResult.packageRoot,
          index_root: indexed.indexRoot,
          capture_run_id: captureResult.manifest.capture_run_id,
          capture_status: captureResult.manifest.status,
          checked_artifacts: verification.checked_artifacts,
          nodes: indexed.graph.nodes.length,
          edges: indexed.graph.edges.length,
          llm_status: llmStatus,
          llm_hypothesis_count: llmHypothesisCount,
          ...(enrichmentJobId
            ? { enrichment_job_id: enrichmentJobId, enrichment_status: enrichmentStatus ?? "queued" }
            : {}),
          ...(designSummary ? { design_summary: designSummary } : {})
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit(job, { stage: "failed", message: "Job failed", error: message });
    }
  }
}

/** Keep job.error readable when verify dumps dozens of duplicate ontology ids. */
export function formatJobIssueList(
  issues: Array<{ code?: string; message?: string }>,
  max = 8
): string {
  if (!issues.length) return "Verification failed";
  const parts = issues.slice(0, max).map((issue) =>
    [issue.code, issue.message].filter(Boolean).join(":")
  );
  const extra = issues.length > max ? ` (+${issues.length - max} more)` : "";
  return `${parts.join("; ")}${extra}`;
}

export function publicJobView(job: JobRecord): Omit<JobRecord, "events"> & { event_count: number; latest_event?: JobEvent } {
  const latest = job.events.at(-1);
  const view: Omit<JobRecord, "events"> & { event_count: number; latest_event?: JobEvent } = {
    job_id: job.job_id,
    url: job.url,
    stage: job.stage,
    message: job.message,
    created_at: job.created_at,
    updated_at: job.updated_at,
    event_count: job.events.length
  };
  if (job.platform_project_id) view.platform_project_id = job.platform_project_id;
  if (job.dig_project_id) view.dig_project_id = job.dig_project_id;
  if (job.result) view.result = job.result;
  if (job.error) view.error = job.error;
  if (latest) view.latest_event = latest;
  return view;
}
