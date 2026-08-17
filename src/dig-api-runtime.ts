/**
 * Shared dig-api process state for MCP tools that wrap jobs / enrichment.
 * Set by the HTTP server; stdio graph MCP leaves this unset.
 */
import type { EnrichmentQueue } from "./enrichment-queue.js";
import type { JobRunner } from "./job-runner.js";

export type DigApiRuntime = {
  runner: JobRunner;
  enrichmentQueue: EnrichmentQueue;
};

let runtime: DigApiRuntime | null = null;

export function setDigApiRuntime(next: DigApiRuntime | null): void {
  runtime = next;
}

export function getDigApiRuntime(): DigApiRuntime | null {
  return runtime;
}

export function requireDigApiRuntime(): DigApiRuntime {
  if (!runtime) {
    throw new Error("spirion jobs/enrichment require the dig-api HTTP process");
  }
  return runtime;
}
