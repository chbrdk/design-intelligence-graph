import type { LlmTokenUsage } from "./llm-provider.js";

export interface StageCostRecord {
  stage_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_usd: number | null;
  cache_hit: boolean;
}

export interface LlmCostSummary {
  prompt_tokens: number;
  completion_tokens: number;
  estimated_usd: number | null;
  by_stage: StageCostRecord[];
}

/** Rough list prices ($/1M) for estimates when provider omits `usage.cost`. */
const RATE_TABLE: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /qwen3\.7-flash/i, input: 0.03, output: 0.13 },
  { match: /gpt-5\.6-luna/i, input: 0.1, output: 0.6 },
  { match: /gemma-4/i, input: 0, output: 0 },
  { match: /nemotron/i, input: 0, output: 0 },
  { match: /:free$/i, input: 0, output: 0 }
];

export function estimateUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const rate = RATE_TABLE.find((row) => row.match.test(model));
  if (!rate) return null;
  return Math.round(((promptTokens * rate.input + completionTokens * rate.output) / 1_000_000) * 1e8) / 1e8;
}

export function usageToStageCost(
  stageId: string,
  model: string,
  usage: LlmTokenUsage | undefined,
  cacheHit: boolean
): StageCostRecord {
  const prompt_tokens = usage?.prompt_tokens ?? 0;
  const completion_tokens = usage?.completion_tokens ?? 0;
  const estimated =
    usage?.cost !== undefined
      ? usage.cost
      : cacheHit
        ? 0
        : estimateUsd(model, prompt_tokens, completion_tokens);
  return {
    stage_id: stageId,
    model,
    prompt_tokens: cacheHit ? 0 : prompt_tokens,
    completion_tokens: cacheHit ? 0 : completion_tokens,
    estimated_usd: cacheHit ? 0 : estimated,
    cache_hit: cacheHit
  };
}

export function aggregateCosts(records: StageCostRecord[]): LlmCostSummary {
  const prompt_tokens = records.reduce((sum, row) => sum + row.prompt_tokens, 0);
  const completion_tokens = records.reduce((sum, row) => sum + row.completion_tokens, 0);
  const usdParts = records.map((row) => row.estimated_usd).filter((value): value is number => value !== null);
  const estimated_usd =
    usdParts.length === records.length ? Math.round(usdParts.reduce((a, b) => a + b, 0) * 1e8) / 1e8 : null;
  return { prompt_tokens, completion_tokens, estimated_usd, by_stage: records };
}
