import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { capture } from "./capture.js";
import { attachCheckionScreenshotIfConfigured } from "./checkion-attach.js";
import { CANONICAL_VIEWPORTS } from "./config.js";
import { asyncEnrichmentEnabled, type EnrichmentQueue } from "./enrichment-queue.js";
import { applyLlmDesignAnalysis } from "./llm-enrich.js";
import { localLlmConfig } from "./llm-provider.js";
import { captureNavConfig, inferCaptureLocale } from "./capture-nav.js";
import { captureJobsConfig } from "./capture-catalog.js";
import { captureSettleConfig } from "./capture-settle.js";
import { DeadlineError, withDeadline } from "./deadline.js";
import { capturesDirectory, imageIngestConfig, indexesDirectory, uploadedImageUrl } from "./runtime-paths.js";
import { indexCapturePackage } from "./storage.js";
import { indexCapturePackageToDatabase } from "./db-index.js";
import { verifyCapturePackage } from "./verify.js";
import { downloadPinImage, type PinterestPin } from "./pinterest-client.js";
import { ingestPinterestPinPackage } from "./pinterest-package.js";
import { ingestUploadedImagePackage, type UploadedImageIngest } from "./image-ingest.js";

export type JobStage = "queued" | "capturing" | "analyzing" | "verifying" | "indexing" | "complete" | "failed" | "skipped";

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
  ingest_source?: "web" | "pinterest" | "upload";
  pinterest_pin?: PinterestPinIngest;
  upload_image?: UploadedImageIngest;
}

export type StartJobOptions = {
  platformProjectId?: string | null;
  digProjectId?: string | null;
};

export type PinterestPinIngest = {
  pin_id: string;
  image_url: string;
  title: string;
  board_id?: string | null;
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
  /** How many Playwright captures may run at once. */
  maxConcurrent?: number;
  /** Wall-clock limit for one Playwright capture (abort + kill browser). */
  hardTimeoutMs?: number;
  /** Wall-clock limit for CHECKION screenshot attach. */
  checkionTimeoutMs?: number;
  /** How many still-image ingest jobs (upload + Pinterest) may run at once. */
  maxImageConcurrent?: number;
  stillImageIngestFn?: (job: JobRecord) => Promise<{
    packageRoot: string;
    manifest: import("./types.js").CaptureManifest;
  }>;
  /** Persist job snapshots to Postgres when a pool is configured. */
  persist?: (job: JobRecord, queueIndex: number | null) => Promise<boolean>;
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
  private runningPlaywright = 0;
  private runningImage = 0;
  private readonly aborts = new Map<string, AbortController>();

  constructor(options: JobRunnerOptions = {}) {
    const jobsCfg = captureJobsConfig();
    this.options = {
      timeoutMs: options.timeoutMs ?? captureNavConfig().jobTimeoutMs,
      settleMs: options.settleMs ?? captureSettleConfig().settleMs,
      maxConcurrent: options.maxConcurrent ?? jobsCfg.maxConcurrent,
      hardTimeoutMs: options.hardTimeoutMs ?? jobsCfg.hardTimeoutMs,
      checkionTimeoutMs: options.checkionTimeoutMs ?? jobsCfg.checkionTimeoutMs,
      maxImageConcurrent: options.maxImageConcurrent ?? imageIngestConfig().maxConcurrent,
      ...options
    };
  }

  listJobs(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  queuedOrder(): string[] {
    return [...this.pending];
  }

  /** Rebuild in-memory queue from Postgres after an API restart. */
  restoreFromPersistence(jobs: JobRecord[], pendingOrder: string[]): void {
    this.jobs.clear();
    this.pending.length = 0;
    for (const job of jobs) {
      this.jobs.set(job.job_id, job);
    }
    for (const jobId of pendingOrder) {
      const job = this.jobs.get(jobId);
      if (job?.stage === "queued") this.pending.push(jobId);
    }
    this.pump();
  }

  private persistJob(job: JobRecord): void {
    const persist = this.options.persist;
    if (!persist) return;
    let queueIndex: number | null = null;
    if (job.stage === "queued") {
      const index = this.pending.indexOf(job.job_id);
      if (index >= 0) queueIndex = index;
    }
    void persist(job, queueIndex).catch(() => undefined);
  }

  private persistQueuedOrder(): void {
    const persist = this.options.persist;
    if (!persist) return;
    for (let index = 0; index < this.pending.length; index += 1) {
      const job = this.jobs.get(this.pending[index]!);
      if (job?.stage === "queued") {
        void persist(job, index).catch(() => undefined);
      }
    }
  }

  cancelQueued(jobId: string): JobRecord | null {
    const job = this.jobs.get(jobId);
    if (!job || job.stage !== "queued") return null;
    const idx = this.pending.indexOf(jobId);
    if (idx >= 0) this.pending.splice(idx, 1);
    this.emit(job, { stage: "skipped", message: "Removed from queue" });
    this.persistQueuedOrder();
    return job;
  }

  /** Mark a queued or in-flight job failed (e.g. stuck capture). */
  failJob(jobId: string, reason = "Job cancelled"): JobRecord | null {
    const job = this.jobs.get(jobId);
    if (!job || job.stage === "complete" || job.stage === "failed" || job.stage === "skipped") return null;
    const idx = this.pending.indexOf(jobId);
    if (idx >= 0) this.pending.splice(idx, 1);
    this.aborts.get(jobId)?.abort(new Error(reason));
    this.emit(job, { stage: "failed", message: "Job cancelled", error: reason });
    this.persistQueuedOrder();
    return job;
  }

  moveQueued(jobId: string, direction: "up" | "down" | "front"): JobRecord | null {
    const job = this.jobs.get(jobId);
    if (!job || job.stage !== "queued") return null;
    const idx = this.pending.indexOf(jobId);
    if (idx < 0) return null;
    this.pending.splice(idx, 1);
    if (direction === "front") this.pending.unshift(jobId);
    else if (direction === "up") this.pending.splice(Math.max(0, idx - 1), 0, jobId);
    else this.pending.splice(Math.min(this.pending.length, idx + 1), 0, jobId);
    this.persistQueuedOrder();
    return job;
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

  startPinterestJobs(pins: PinterestPinIngest[], options: StartJobOptions = {}): JobRecord[] {
    return pins.map((pin) => this.startPinterestJob(pin, options));
  }

  startPinterestJob(pin: PinterestPinIngest, options: StartJobOptions = {}): JobRecord {
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const platformProjectId = options.platformProjectId?.trim() || null;
    const digProjectId = options.digProjectId?.trim() || null;
    const url = pin.image_url;
    const job: JobRecord = {
      job_id: createJobId(this.options.now),
      url,
      stage: "queued",
      message: "Pinterest pin queued",
      created_at: now,
      updated_at: now,
      events: [],
      ingest_source: "pinterest",
      pinterest_pin: pin,
      ...(platformProjectId ? { platform_project_id: platformProjectId } : {}),
      ...(digProjectId ? { dig_project_id: digProjectId } : {})
    };
    this.jobs.set(job.job_id, job);
    this.emit(job, { stage: "queued", message: `Waiting to ingest pin ${pin.pin_id}` });
    this.pending.push(job.job_id);
    this.pump();
    return job;
  }

  startUploadJobs(files: UploadedImageIngest[], options: StartJobOptions = {}): JobRecord[] {
    return files.map((file) => this.startUploadJob(file, options));
  }

  startUploadJob(file: UploadedImageIngest, options: StartJobOptions = {}): JobRecord {
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const platformProjectId = options.platformProjectId?.trim() || null;
    const digProjectId = options.digProjectId?.trim() || null;
    const url = uploadedImageUrl(file.source_id);
    const job: JobRecord = {
      job_id: createJobId(this.options.now),
      url,
      stage: "queued",
      message: "Image upload queued",
      created_at: now,
      updated_at: now,
      events: [],
      ingest_source: "upload",
      upload_image: file,
      ...(platformProjectId ? { platform_project_id: platformProjectId } : {}),
      ...(digProjectId ? { dig_project_id: digProjectId } : {})
    };
    this.jobs.set(job.job_id, job);
    this.emit(job, { stage: "queued", message: `Waiting to ingest ${file.filename}` });
    this.pending.push(job.job_id);
    this.pump();
    return job;
  }

  private maxConcurrent(): number {
    return Math.max(1, this.options.maxConcurrent ?? 1);
  }

  private maxImageConcurrent(): number {
    return Math.max(1, this.options.maxImageConcurrent ?? 1);
  }

  private hardTimeoutMs(): number {
    const value = this.options.hardTimeoutMs ?? 480_000;
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 480_000;
  }

  private checkionTimeoutMs(): number {
    const value = this.options.checkionTimeoutMs ?? 120_000;
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 120_000;
  }

  private pump(): void {
    const playwrightCap = this.maxConcurrent();
    const imageCap = this.maxImageConcurrent();
    let progressed = true;
    while (progressed) {
      progressed = false;
      const idx = this.pending.findIndex((id) => {
        const job = this.jobs.get(id);
        if (!job) return false;
        return isImageIngestJob(job)
          ? this.runningImage < imageCap
          : this.runningPlaywright < playwrightCap;
      });
      if (idx < 0) break;
      const jobId = this.pending.splice(idx, 1)[0];
      if (!jobId) break;
      const job = this.jobs.get(jobId);
      if (!job) continue;
      const image = isImageIngestJob(job);
      if (image) this.runningImage += 1;
      else this.runningPlaywright += 1;
      progressed = true;
      const abort = new AbortController();
      this.aborts.set(jobId, abort);
      void this.run(jobId, abort.signal).finally(() => {
        this.aborts.delete(jobId);
        if (image) this.runningImage -= 1;
        else this.runningPlaywright -= 1;
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
    this.persistJob(job);
    return event;
  }

  private async run(jobId: string, signal?: AbortSignal): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.stage === "failed" || job.stage === "skipped" || job.stage === "complete") return;
    const captureFn = this.options.captureFn ?? capture;
    const verifyFn = this.options.verifyFn ?? verifyCapturePackage;
    const indexFn = this.options.indexFn ?? indexCapturePackage;
    const capturesDir = this.options.capturesDir ?? capturesDirectory();
    const indexesDir = this.options.indexesDir ?? indexesDirectory();

    try {
      const isImage = isImageIngestJob(job);
      this.emit(job, {
        stage: "capturing",
        message: job.ingest_source === "upload"
          ? `Ingesting uploaded image ${job.upload_image?.filename ?? job.job_id}`
          : job.ingest_source === "pinterest"
            ? `Downloading Pinterest pin ${job.pinterest_pin!.pin_id}`
            : `Detecting layout evidence across ${CANONICAL_VIEWPORTS.length} viewports`,
        progress: {
          current: 0,
          total: isImage ? 1 : CANONICAL_VIEWPORTS.length,
          label: isImage ? "image" : "viewports"
        }
      });
      let captureResult: { packageRoot: string; manifest: import("./types.js").CaptureManifest };
      if (this.options.stillImageIngestFn && isImage) {
        captureResult = await this.options.stillImageIngestFn(job);
      } else if (job.ingest_source === "upload" && job.upload_image) {
        const image = await readFile(job.upload_image.path);
        captureResult = await ingestUploadedImagePackage({
          image,
          outputDirectory: capturesDir,
          sourceId: job.upload_image.source_id,
          filename: job.upload_image.filename
        });
      } else if (job.ingest_source === "pinterest" && job.pinterest_pin) {
        const image = await downloadPinImage(job.pinterest_pin.image_url);
        const pin: PinterestPin = {
          id: job.pinterest_pin.pin_id,
          title: job.pinterest_pin.title,
          description: "",
          link: null,
          board_id: job.pinterest_pin.board_id ?? null,
          image: { url: job.pinterest_pin.image_url, width: 1, height: 1 }
        };
        captureResult = await ingestPinterestPinPackage({
          pin,
          image,
          outputDirectory: capturesDir,
          ...(job.pinterest_pin.board_id ? { boardId: job.pinterest_pin.board_id } : {})
        });
      } else {
        const abort = signal ? new AbortController() : undefined;
        const onParentAbort = () => abort?.abort(signal?.reason);
        if (signal) {
          if (signal.aborted) onParentAbort();
          else signal.addEventListener("abort", onParentAbort, { once: true });
        }
        try {
          captureResult = await withDeadline(
            () =>
              captureFn({
                url: job.url,
                outputDirectory: capturesDir,
                viewports: CANONICAL_VIEWPORTS,
                timeoutMs: this.options.timeoutMs,
                settleMs: this.options.settleMs,
                locale: inferCaptureLocale(job.url, "Europe/Berlin"),
                timezoneId: "Europe/Berlin",
                colorScheme: "light",
                reducedMotion: "no-preference",
                headed: false,
                ...(abort ? { signal: abort.signal } : {})
              }),
            this.hardTimeoutMs(),
            () => abort?.abort(new DeadlineError(this.hardTimeoutMs(), "capture")),
            "capture"
          );
        } finally {
          if (signal) signal.removeEventListener("abort", onParentAbort);
        }
      }
      if (this.jobs.get(jobId)?.stage === "failed" || signal?.aborted) {
        throw signal?.reason instanceof Error ? signal.reason : new Error("Job cancelled");
      }
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
        message: isImage ? "Skipping CHECKION for still-image ingest" : "Capturing full-page screenshot via CHECKION"
      });
      let checkion: Awaited<ReturnType<typeof attachCheckionScreenshotIfConfigured>>;
      if (isImage) {
        checkion = { attached: false, skipped: `${job.ingest_source ?? "image"}_ingest` };
      } else {
        try {
          checkion = await withDeadline(
            () => attachCheckionScreenshotIfConfigured(captureResult.packageRoot, job.url),
            this.checkionTimeoutMs(),
            undefined,
            "checkion"
          );
        } catch (checkionError: unknown) {
          checkion = {
            attached: false,
            skipped: checkionError instanceof Error ? checkionError.message : String(checkionError)
          };
        }
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
      const stage = this.jobs.get(jobId)?.stage;
      if (stage === "failed" || stage === "skipped" || stage === "complete") return;
      const message = error instanceof Error ? error.message : String(error);
      this.emit(job, { stage: "failed", message: "Job failed", error: message });
    } finally {
      if (job.upload_image?.path) {
        await unlink(job.upload_image.path).catch(() => undefined);
      }
    }
  }
}

function isImageIngestJob(job: JobRecord): boolean {
  return job.ingest_source === "pinterest" || job.ingest_source === "upload";
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

export function publicJobView(
  job: JobRecord,
  queueIndex: number | null = null
): Omit<JobRecord, "events"> & { event_count: number; latest_event?: JobEvent; queue_index?: number | null } {
  const latest = job.events.at(-1);
  const view: Omit<JobRecord, "events"> & { event_count: number; latest_event?: JobEvent; queue_index?: number | null } = {
    job_id: job.job_id,
    url: job.url,
    stage: job.stage,
    message: job.message,
    created_at: job.created_at,
    updated_at: job.updated_at,
    event_count: job.events.length,
    queue_index: job.stage === "queued" ? queueIndex : null
  };
  if (job.platform_project_id) view.platform_project_id = job.platform_project_id;
  if (job.dig_project_id) view.dig_project_id = job.dig_project_id;
  if (job.ingest_source) view.ingest_source = job.ingest_source;
  if (job.result) view.result = job.result;
  if (job.error) view.error = job.error;
  if (latest) view.latest_event = latest;
  return view;
}
