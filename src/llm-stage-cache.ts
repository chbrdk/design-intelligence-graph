import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { LlmStageId } from "./llm-stages.js";
import { indexesDirectory } from "./runtime-paths.js";

export interface LlmStageCacheEntry {
  stage_id: LlmStageId | string;
  model: string;
  evidence_sha256: string;
  raw_response: string;
  parsed_json?: unknown;
  status: "complete" | "failed";
  created_at: string;
  cache_hit?: boolean;
}

export interface LlmStageCache {
  get(stageId: string, model: string, evidenceSha256: string): Promise<LlmStageCacheEntry | null>;
  set(entry: Omit<LlmStageCacheEntry, "created_at" | "cache_hit"> & { created_at?: string }): Promise<void>;
}

export function evidenceSha256(evidenceJson: string): string {
  return createHash("sha256").update(evidenceJson).digest("hex");
}

function cacheKey(stageId: string, model: string, evidenceSha256Value: string): string {
  return createHash("sha256").update(`${stageId}\0${model}\0${evidenceSha256Value}`).digest("hex");
}

/** In-memory cache for tests / single-process workers. */
export class MemoryLlmStageCache implements LlmStageCache {
  private readonly map = new Map<string, LlmStageCacheEntry>();

  async get(stageId: string, model: string, evidenceSha256Value: string): Promise<LlmStageCacheEntry | null> {
    const hit = this.map.get(cacheKey(stageId, model, evidenceSha256Value));
    return hit ? { ...hit, cache_hit: true } : null;
  }

  async set(entry: Omit<LlmStageCacheEntry, "created_at" | "cache_hit"> & { created_at?: string }): Promise<void> {
    const created_at = entry.created_at ?? new Date().toISOString();
    this.map.set(cacheKey(entry.stage_id, entry.model, entry.evidence_sha256), {
      ...entry,
      created_at,
      cache_hit: false
    });
  }
}

/** Content-addressed file cache under indexes/llm-stage-cache. */
export class FileLlmStageCache implements LlmStageCache {
  constructor(private readonly rootDir = resolve(indexesDirectory(), "llm-stage-cache")) {}

  private pathFor(stageId: string, model: string, evidenceSha256Value: string): string {
    return resolve(this.rootDir, `${cacheKey(stageId, model, evidenceSha256Value)}.json`);
  }

  async get(stageId: string, model: string, evidenceSha256Value: string): Promise<LlmStageCacheEntry | null> {
    try {
      const raw = await readFile(this.pathFor(stageId, model, evidenceSha256Value), "utf8");
      const entry = JSON.parse(raw) as LlmStageCacheEntry;
      return { ...entry, cache_hit: true };
    } catch {
      return null;
    }
  }

  async set(entry: Omit<LlmStageCacheEntry, "created_at" | "cache_hit"> & { created_at?: string }): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const created_at = entry.created_at ?? new Date().toISOString();
    const payload: LlmStageCacheEntry = { ...entry, created_at };
    await writeFile(
      this.pathFor(entry.stage_id, entry.model, entry.evidence_sha256),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8"
    );
  }
}

export function createDefaultStageCache(): LlmStageCache {
  return new FileLlmStageCache();
}
