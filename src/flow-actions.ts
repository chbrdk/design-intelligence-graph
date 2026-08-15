import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FLOW_ACTIONS_VERSION = "0.1.0";

export interface FlowActionTerm {
  id: string;
  label: string;
  aliases: string[];
  path_hints: string[];
}

interface FlowActionsCatalogFile {
  version: string;
  idPrefix: string;
  actions: FlowActionTerm[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveCatalogPath(): string {
  try {
    const paths = JSON.parse(readFileSync(resolve(ROOT, "knowledge/paths.json"), "utf8")) as {
      taxonomy?: { flowActionsCatalog?: string };
    };
    const relative = paths.taxonomy?.flowActionsCatalog ?? "knowledge/flow-actions-catalog.json";
    return resolve(ROOT, relative);
  } catch {
    return resolve(ROOT, "knowledge/flow-actions-catalog.json");
  }
}

function loadCatalog(): FlowActionsCatalogFile {
  const parsed = JSON.parse(readFileSync(resolveCatalogPath(), "utf8")) as FlowActionsCatalogFile;
  if (!Array.isArray(parsed.actions)) {
    throw new Error("flow-actions catalog missing actions[]");
  }
  return parsed;
}

let cached: FlowActionsCatalogFile | null = null;

export function getFlowActionsCatalog(): FlowActionsCatalogFile {
  if (!cached) cached = loadCatalog();
  return cached;
}

/** Test helper: drop memoized catalog after mutating paths/fixtures. */
export function resetFlowActionsCatalogCache(): void {
  cached = null;
}

export function listFlowActions(): FlowActionTerm[] {
  return getFlowActionsCatalog().actions;
}

export function isFlowActionId(id: string): boolean {
  return listFlowActions().some((action) => action.id === id);
}

/** Suggest L2 action ids from a URL path (deterministic, no LLM). */
export function suggestFlowActionsFromPath(pathname: string): string[] {
  const normalized = pathname.toLowerCase().split("?")[0] ?? pathname.toLowerCase();
  const hits: string[] = [];
  for (const action of listFlowActions()) {
    if (action.id === "dig:flow.unknown") continue;
    if (action.path_hints.some((hint) => normalized === hint || normalized.startsWith(`${hint}/`))) {
      hits.push(action.id);
    }
  }
  return hits.length > 0 ? hits : ["dig:flow.unknown"];
}

export function assertFlowActionIds(ids: string[]): void {
  for (const id of ids) {
    if (!isFlowActionId(id)) {
      throw new Error(`Unknown flow action id: ${id}`);
    }
  }
}
