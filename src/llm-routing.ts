import { createHash, randomUUID } from "node:crypto";
import { loadDigPaths } from "./runtime-paths.js";

export interface ScalingRoles {
  bulkText: string;
  qualityText: string | null;
  confidenceEscalateBelow: number;
  bulkReasoningEffort: "none" | "low" | "medium" | "high" | "max" | undefined;
}

export function resolveScalingRoles(environment: NodeJS.ProcessEnv = process.env): ScalingRoles {
  const paths = loadDigPaths();
  const roles = paths.llm.scaling?.roles;
  const bulkText =
    environment.DIG_LLM_BULK_MODEL ??
    roles?.bulkText ??
    environment.DIG_LLM_MODEL ??
    paths.llm.openrouter?.defaultModel ??
    paths.llm.defaultModel;
  const qualityRaw =
    environment.DIG_LLM_QUALITY_MODEL ?? roles?.qualityText ?? paths.llm.openrouter?.defaultModel ?? null;
  const qualityText = qualityRaw && qualityRaw !== bulkText ? qualityRaw : null;
  const threshold = Number(environment.DIG_LLM_ESCALATE_BELOW ?? paths.llm.scaling?.confidenceEscalateBelow ?? 0.55);
  const effortRaw = (
    environment.DIG_LLM_REASONING_EFFORT ??
    paths.llm.scaling?.bulkReasoningEffort ??
    ""
  ).toLowerCase();
  const bulkReasoningEffort =
    effortRaw === "none" ||
    effortRaw === "low" ||
    effortRaw === "medium" ||
    effortRaw === "high" ||
    effortRaw === "max"
      ? effortRaw
      : bulkText.includes("qwen")
        ? "none"
        : undefined;
  return {
    bulkText,
    qualityText,
    confidenceEscalateBelow: Number.isFinite(threshold) ? threshold : 0.55,
    bulkReasoningEffort
  };
}

export function meanConfidence(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function shouldEscalateStage(options: {
  parseOk: boolean;
  itemCount: number;
  confidences: number[];
  threshold: number;
}): boolean {
  if (!options.parseOk) return true;
  if (options.itemCount <= 0) return true;
  return meanConfidence(options.confidences) < options.threshold;
}

export function createEnrichmentJobId(now = () => new Date()): string {
  return `enr_${now().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function packageEvidenceFingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
