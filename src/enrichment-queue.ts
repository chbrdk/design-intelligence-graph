import { applyLlmDesignAnalysis } from "./llm-enrich.js";
import { createDefaultStageCache, type LlmStageCache } from "./llm-stage-cache.js";
import { localLlmConfig, type LlmCompleter, type LlmProviderConfig } from "./llm-provider.js";
import { createEnrichmentJobId, resolveScalingRoles } from "./llm-routing.js";
import { indexCapturePackageToDatabase } from "./db-index.js";
import { loadDigPaths } from "./runtime-paths.js";
import { claimNextEnrichmentJob, persistEnrichmentJob } from "./enrichment-store.js";

export type EnrichmentStatus = "queued" | "running" | "complete" | "failed" | "skipped";

export interface EnrichmentJobRecord {
  enrichment_job_id: string;
  capture_job_id?: string;
  capture_run_id: string;
  package_path: string;
  status: EnrichmentStatus;
  message: string;
  attempts: number;
  max_attempts: number;
  bulk_model?: string;
  quality_model?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  llm_status?: string;
  hypothesis_count?: number;
  design_summary?: string;
  vision_status?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  estimated_usd?: number | null;
}

export interface EnrichmentQueueOptions {
  now?: () => Date;
  analyzeFn?: typeof applyLlmDesignAnalysis;
  reindexFn?: typeof indexCapturePackageToDatabase;
  stageCache?: LlmStageCache;
  provider?: LlmCompleter;
  config?: LlmProviderConfig;
  pollMs?: number;
  autoStart?: boolean;
  persist?: typeof persistEnrichmentJob;
  claim?: typeof claimNextEnrichmentJob;
}

export function asyncEnrichmentEnabled(
  environment: NodeJS.ProcessEnv = process.env,
  llmEnabled = localLlmConfig(environment).enabled
): boolean {
  if (!llmEnabled) return false;
  const raw = (environment.DIG_LLM_ASYNC ?? "").trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return loadDigPaths().llm.scaling?.asyncDefault !== false;
}

export class EnrichmentQueue {
  private readonly jobs = new Map<string, EnrichmentJobRecord>();
  private readonly options: EnrichmentQueueOptions;
  private timer: NodeJS.Timeout | null = null;
  private pumping = false;

  constructor(options: EnrichmentQueueOptions = {}) {
    this.options = options;
    if (options.autoStart !== false) this.start();
  }

  start(): void {
    if (this.timer) return;
    const pollMs = this.options.pollMs ?? 750;
    this.timer = setInterval(() => {
      void this.pump();
    }, pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  listJobs(): EnrichmentJobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getJob(id: string): EnrichmentJobRecord | undefined {
    return this.jobs.get(id);
  }

  enqueue(input: {
    package_path: string;
    capture_run_id: string;
    capture_job_id?: string;
  }): EnrichmentJobRecord {
    const now = (this.options.now ?? (() => new Date()))().toISOString();
    const roles = resolveScalingRoles();
    const job: EnrichmentJobRecord = {
      enrichment_job_id: createEnrichmentJobId(this.options.now),
      capture_run_id: input.capture_run_id,
      package_path: input.package_path,
      status: "queued",
      message: "Enrichment queued",
      attempts: 0,
      max_attempts: 3,
      bulk_model: roles.bulkText,
      quality_model: roles.qualityText,
      created_at: now,
      updated_at: now,
      ...(input.capture_job_id ? { capture_job_id: input.capture_job_id } : {})
    };
    this.jobs.set(job.enrichment_job_id, job);
    void (this.options.persist ?? persistEnrichmentJob)(job).catch(() => undefined);
    if (this.timer) void this.pump();
    return job;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let next = [...this.jobs.values()].find((job) => job.status === "queued");
      if (!next) {
        const claimed = await (this.options.claim ?? claimNextEnrichmentJob)().catch(() => null);
        if (claimed) {
          this.jobs.set(claimed.enrichment_job_id, claimed);
          await this.runJob(claimed.enrichment_job_id, { alreadyClaimed: true });
          return;
        }
      }
      if (next) await this.runJob(next.enrichment_job_id);
    } finally {
      this.pumping = false;
    }
  }

  private async runJob(jobId: string, opts: { alreadyClaimed?: boolean } = {}): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (!opts.alreadyClaimed && job.status !== "queued") return;
    const nowFn = this.options.now ?? (() => new Date());
    if (!opts.alreadyClaimed) {
      job.status = "running";
      job.attempts += 1;
      job.started_at = nowFn().toISOString();
    }
    job.message = "Running staged LLM enrichment";
    job.updated_at = nowFn().toISOString();
    await (this.options.persist ?? persistEnrichmentJob)(job).catch(() => undefined);

    const analyzeFn = this.options.analyzeFn ?? applyLlmDesignAnalysis;
    const reindexFn = this.options.reindexFn ?? indexCapturePackageToDatabase;
    const config = this.options.config ?? localLlmConfig();
    const roles = resolveScalingRoles();
    const effectiveConfig: LlmProviderConfig = {
      ...config,
      model: roles.bulkText || config.model
    };
    if (roles.bulkVision) effectiveConfig.visionModel = roles.bulkVision;
    else if (config.visionModel) effectiveConfig.visionModel = config.visionModel;
    if (roles.bulkReasoningEffort) effectiveConfig.reasoningEffort = roles.bulkReasoningEffort;

    try {
      if (!effectiveConfig.enabled) {
        job.status = "skipped";
        job.message = "LLM disabled";
        job.llm_status = "skipped";
        job.completed_at = nowFn().toISOString();
        job.updated_at = job.completed_at;
        await (this.options.persist ?? persistEnrichmentJob)(job).catch(() => undefined);
        return;
      }
      const enrichment = await analyzeFn(job.package_path, {
        config: effectiveConfig,
        ...(this.options.provider ? { provider: this.options.provider } : {}),
        stageCache: this.options.stageCache ?? createDefaultStageCache()
      });
      job.llm_status = enrichment.llm.status;
      job.hypothesis_count = enrichment.llm.hypotheses.length;
      if (enrichment.llm.design_summary) job.design_summary = enrichment.llm.design_summary;
      if (enrichment.llm.vision?.status) job.vision_status = enrichment.llm.vision.status;
      if (enrichment.llm.cost) {
        job.prompt_tokens = enrichment.llm.cost.prompt_tokens;
        job.completion_tokens = enrichment.llm.cost.completion_tokens;
        job.estimated_usd = enrichment.llm.cost.estimated_usd;
      }
      if (enrichment.llm.status === "failed") {
        job.status = "failed";
        job.error = enrichment.llm.error ?? "LLM enrichment failed";
        job.message = "Enrichment failed";
      } else {
        job.status = "complete";
        job.message = enrichment.updated
          ? `Enrichment complete (${job.hypothesis_count} hypotheses${job.vision_status ? `, vision=${job.vision_status}` : ""})`
          : "Enrichment finished without artifact update";
        try {
          await reindexFn(job.package_path);
        } catch (error: unknown) {
          job.message = `${job.message}; DB reindex skipped`;
          job.error = error instanceof Error ? error.message : String(error);
        }
      }
      job.completed_at = nowFn().toISOString();
      job.updated_at = job.completed_at;
      await (this.options.persist ?? persistEnrichmentJob)(job).catch(() => undefined);
    } catch (error: unknown) {
      job.error = error instanceof Error ? error.message : String(error);
      job.updated_at = nowFn().toISOString();
      if (job.attempts < job.max_attempts) {
        job.status = "queued";
        job.message = `Retry scheduled (${job.attempts}/${job.max_attempts})`;
      } else {
        job.status = "failed";
        job.message = "Enrichment failed";
        job.completed_at = job.updated_at;
      }
      await (this.options.persist ?? persistEnrichmentJob)(job).catch(() => undefined);
    }
  }
}

export function publicEnrichmentView(job: EnrichmentJobRecord): EnrichmentJobRecord {
  return { ...job };
}
