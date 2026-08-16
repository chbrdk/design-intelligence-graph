/**
 * DIG-011 Phase C — detect closed dig:flow.* actions (C1 L2 + C2 L3 soft-fail).
 * Spec: docs/DIG-011-phase-c-detect.md
 */

import type { LlmCompleter, LlmMessage } from "./llm-provider.js";
import { extractJsonObjectLoose } from "./json-repair.js";
import {
  assertFlowActionIds,
  isFlowActionId,
  listFlowActions,
  suggestFlowActionsFromPath
} from "./flow-actions.js";
import { writeArtifact } from "./io.js";
import type { ArtifactReference } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";
import { createHash } from "node:crypto";

export const FLOW_ACTIONS_DETECT_VERSION = "0.1.0";
export const FLOW_ACTIONS_DETECT_RELATIVE_PATH = "derived/flow-actions.json";

export interface FlowActionAssignment {
  taxonomy_id: string;
  confidence: number;
  method: string;
  layer: "L2" | "L3";
}

export interface FlowDetectScreen {
  order: number;
  url: string;
  capture_run_id?: string;
  /** Ontology taxonomy ids observed on the screen (e.g. dig:component.form). */
  ontology_taxonomy_ids?: string[];
  screen_patterns?: string[];
  ui_element_labels?: string[];
  has_form?: boolean;
  has_nav?: boolean;
}

export interface FlowActionsLlmResult {
  flow_action_ids: string[];
  title?: string;
  rationale?: string;
}

export interface FlowActionsDetectDocument {
  schema_version: "0.1.0";
  flow_actions_detect_version: typeof FLOW_ACTIONS_DETECT_VERSION;
  generated_at: string;
  app_scope_id: string;
  flow_session_id: string | null;
  flow_id?: string;
  title?: string;
  rationale?: string;
  flow_actions: FlowActionAssignment[];
  layers: {
    l2: FlowActionAssignment[];
    l3: FlowActionAssignment[] | null;
    l3_status: "complete" | "failed" | "skipped";
    l3_error?: string;
  };
  evidence_fingerprint: string;
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase().split("?")[0] || "/";
  } catch {
    const raw = url.toLowerCase().split("?")[0] || "/";
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function hasFormSignal(screen: FlowDetectScreen): boolean {
  if (screen.has_form) return true;
  const ids = screen.ontology_taxonomy_ids ?? [];
  if (ids.some((id) => /form|input|password|textbox/i.test(id))) return true;
  const labels = [...(screen.ui_element_labels ?? []), ...(screen.screen_patterns ?? [])]
    .join(" ")
    .toLowerCase();
  return /\b(form|password|email field|sign[\s-]?in|log[\s-]?in)\b/.test(labels);
}

function hasNavSignal(screen: FlowDetectScreen): boolean {
  if (screen.has_nav) return true;
  const ids = screen.ontology_taxonomy_ids ?? [];
  if (ids.some((id) => /nav|navigation|menubar|tabbar/i.test(id))) return true;
  return /\b(navigation|nav|menu|tab bar)\b/i.test(
    [...(screen.ui_element_labels ?? []), ...(screen.screen_patterns ?? [])].join(" ")
  );
}

function upsertAction(
  map: Map<string, FlowActionAssignment>,
  assignment: FlowActionAssignment
): void {
  const existing = map.get(assignment.taxonomy_id);
  if (!existing || assignment.confidence > existing.confidence) {
    map.set(assignment.taxonomy_id, assignment);
  }
}

/** C1 — deterministic closed-vocab detection. */
export function detectFlowActionsL2(screens: FlowDetectScreen[]): FlowActionAssignment[] {
  const byId = new Map<string, FlowActionAssignment>();
  const ordered = [...screens].sort((a, b) => a.order - b.order);

  for (const screen of ordered) {
    const path = pathnameOf(screen.url);
    const pathHits = suggestFlowActionsFromPath(path).filter((id) => id !== "dig:flow.unknown");
    for (const id of pathHits) {
      upsertAction(byId, {
        taxonomy_id: id,
        confidence: 0.75,
        method: "path_hint",
        layer: "L2"
      });
    }

    const form = hasFormSignal(screen);
    if ((path === "/login" || path.startsWith("/login/") || path.includes("/signin") || path.includes("/sign-in")) && form) {
      upsertAction(byId, {
        taxonomy_id: "dig:flow.logging_in",
        confidence: 0.9,
        method: "path_ontology_rule",
        layer: "L2"
      });
    }
    if (
      (path.includes("/signup") || path.includes("/sign-up") || path.includes("/register")) &&
      form
    ) {
      upsertAction(byId, {
        taxonomy_id: "dig:flow.creating_account",
        confidence: 0.9,
        method: "path_ontology_rule",
        layer: "L2"
      });
    }
    if (path.includes("/checkout") || path === "/cart" || path.startsWith("/cart/")) {
      upsertAction(byId, {
        taxonomy_id: "dig:flow.checkout",
        confidence: form ? 0.88 : 0.8,
        method: form ? "path_ontology_rule" : "path_hint",
        layer: "L2"
      });
    }
    if (path.includes("/settings") || path.includes("/preferences")) {
      upsertAction(byId, {
        taxonomy_id: "dig:flow.settings",
        confidence: 0.82,
        method: "path_hint",
        layer: "L2"
      });
    }
    if (hasNavSignal(screen) && ordered.length >= 1) {
      upsertAction(byId, {
        taxonomy_id: "dig:flow.navigation_ia",
        confidence: 0.55,
        method: "ontology_nav_signal",
        layer: "L2"
      });
    }
  }

  if (byId.size === 0) {
    return [
      {
        taxonomy_id: "dig:flow.unknown",
        confidence: 0.4,
        method: "no_match",
        layer: "L2"
      }
    ];
  }

  // Drop unknown if we have real labels.
  byId.delete("dig:flow.unknown");
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence || a.taxonomy_id.localeCompare(b.taxonomy_id));
}

export function flowActionsEvidenceBudget(screens: FlowDetectScreen[]): string {
  const ordered = [...screens].sort((a, b) => a.order - b.order);
  return JSON.stringify({
    screens: ordered.map((screen) => ({
      order: screen.order,
      path: pathnameOf(screen.url),
      screen_patterns: (screen.screen_patterns ?? []).slice(0, 6),
      ui_element_labels: (screen.ui_element_labels ?? []).slice(0, 10)
    }))
  });
}

export function flowActionsEvidenceFingerprint(screens: FlowDetectScreen[], edgeIds: string[] = []): string {
  const payload = JSON.stringify({
    screens: [...screens]
      .sort((a, b) => a.order - b.order)
      .map((screen) => ({
        order: screen.order,
        id: screen.capture_run_id ?? pathnameOf(screen.url),
        path: pathnameOf(screen.url)
      })),
    edges: [...edgeIds].sort()
  });
  return createHash("sha256").update(payload).digest("hex");
}

export const FLOW_ACTIONS_STAGE_SYSTEM_PROMPT = `You classify a multi-screen design flow into closed Mobbin-style flowActions.
Return ONLY minified JSON:
{"flow_action_ids":["dig:flow.…"],"title":string,"rationale":string}
Rules:
- flow_action_ids MUST be from the provided catalog ids only; prefer 1-3 labels.
- Never invent ids; use dig:flow.unknown only if nothing fits.
- title ≤ 60 chars; rationale ≤ 160 chars.
- Use ordered screen paths + pattern/element labels only — no HTML.`;

export function flowActionsStageUserPrompt(evidenceJson: string, catalogIds: string[]): string {
  return `Catalog ids: ${catalogIds.join(", ")}\nEvidence JSON:\n${evidenceJson}\nReturn JSON only.`;
}

/** Parse + validate C2 LLM output; drop unknown ids. */
export function parseFlowActionsStage(raw: string): FlowActionsLlmResult {
  const parsed = extractJsonObjectLoose(raw) as {
    flow_action_ids?: unknown;
    title?: unknown;
    rationale?: unknown;
  };
  const ids = Array.isArray(parsed.flow_action_ids)
    ? parsed.flow_action_ids
        .map((item) => String(item).trim())
        .filter((id) => isFlowActionId(id))
        .slice(0, 6)
    : [];
  const unique = [...new Set(ids)];
  const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 60) : undefined;
  const rationale =
    typeof parsed.rationale === "string" ? parsed.rationale.trim().slice(0, 160) : undefined;
  return {
    flow_action_ids: unique.length ? unique : [],
    ...(title ? { title } : {}),
    ...(rationale ? { rationale } : {})
  };
}

export function llmResultToAssignments(result: FlowActionsLlmResult): FlowActionAssignment[] {
  if (!result.flow_action_ids.length) return [];
  return result.flow_action_ids.map((id) => ({
    taxonomy_id: id,
    confidence: id === "dig:flow.unknown" ? 0.45 : 0.72,
    method: "llm_flow_actions",
    layer: "L3" as const
  }));
}

/**
 * Merge L2 + L3. Soft-fail: if L3 empty/failed, keep L2 only.
 * Prefer higher confidence per taxonomy_id; L3 can add new catalog ids.
 */
export function mergeFlowActionDetections(
  l2: FlowActionAssignment[],
  l3: FlowActionAssignment[] | null
): FlowActionAssignment[] {
  const map = new Map<string, FlowActionAssignment>();
  for (const item of l2) upsertAction(map, item);
  if (l3?.length) {
    for (const item of l3) {
      if (!isFlowActionId(item.taxonomy_id)) continue;
      upsertAction(map, item);
    }
  }
  map.delete("dig:flow.unknown");
  if (map.size === 0) {
    return [
      {
        taxonomy_id: "dig:flow.unknown",
        confidence: 0.4,
        method: "no_match",
        layer: "L2"
      }
    ];
  }
  const merged = [...map.values()].sort(
    (a, b) => b.confidence - a.confidence || a.taxonomy_id.localeCompare(b.taxonomy_id)
  );
  assertFlowActionIds(merged.map((item) => item.taxonomy_id));
  return merged;
}

export function detectFlowActions(input: {
  appScopeId: string;
  flowSessionId?: string | null;
  flowId?: string;
  screens: FlowDetectScreen[];
  edgeIds?: string[];
  llmRaw?: string | null;
  llmError?: string | null;
  skipLlm?: boolean;
}): FlowActionsDetectDocument {
  const l2 = detectFlowActionsL2(input.screens);
  let l3: FlowActionAssignment[] | null = null;
  let l3Status: FlowActionsDetectDocument["layers"]["l3_status"] = "skipped";
  let l3Error: string | undefined;
  let title: string | undefined;
  let rationale: string | undefined;

  if (input.skipLlm) {
    l3Status = "skipped";
  } else if (input.llmError) {
    l3Status = "failed";
    l3Error = input.llmError;
  } else if (input.llmRaw != null) {
    try {
      const parsed = parseFlowActionsStage(input.llmRaw);
      l3 = llmResultToAssignments(parsed);
      title = parsed.title;
      rationale = parsed.rationale;
      l3Status = l3.length ? "complete" : "failed";
      if (!l3.length) l3Error = "empty_or_invalid_flow_action_ids";
    } catch (error: unknown) {
      l3Status = "failed";
      l3Error = error instanceof Error ? error.message : String(error);
      l3 = null;
    }
  }

  const flow_actions = mergeFlowActionDetections(l2, l3Status === "complete" ? l3 : null);

  return {
    schema_version: "0.1.0",
    flow_actions_detect_version: FLOW_ACTIONS_DETECT_VERSION,
    generated_at: new Date().toISOString(),
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? null,
    ...(input.flowId ? { flow_id: input.flowId } : {}),
    ...(title ? { title } : {}),
    ...(rationale ? { rationale } : {}),
    flow_actions,
    layers: {
      l2,
      l3: l3Status === "complete" ? l3 : null,
      l3_status: l3Status,
      ...(l3Error ? { l3_error: l3Error } : {})
    },
    evidence_fingerprint: flowActionsEvidenceFingerprint(input.screens, input.edgeIds ?? [])
  };
}

export async function emitFlowActionsDetect(
  root: string,
  document: FlowActionsDetectDocument
): Promise<{ path: string; artifact: ArtifactReference; document: FlowActionsDetectDocument }> {
  const relative =
    (loadDigPaths() as { flowActionsDetect?: { relativePath?: string } }).flowActionsDetect
      ?.relativePath ?? FLOW_ACTIONS_DETECT_RELATIVE_PATH;
  const artifact = await writeArtifact(root, relative, JSON.stringify(document, null, 2), "application/json");
  return { path: relative, artifact, document };
}

export function catalogIdsForPrompt(): string[] {
  return listFlowActions().map((action) => action.id);
}

/** Optional C2 call — not part of single-page DIG-009 default stages. */
export async function runFlowActionsLlmStage(
  provider: LlmCompleter,
  screens: FlowDetectScreen[],
  options: { maxTokens?: number; model?: string } = {}
): Promise<{ raw: string; model: string }> {
  const evidence = flowActionsEvidenceBudget(screens);
  const messages: LlmMessage[] = [
    { role: "system", content: FLOW_ACTIONS_STAGE_SYSTEM_PROMPT },
    { role: "user", content: flowActionsStageUserPrompt(evidence, catalogIdsForPrompt()) }
  ];
  const completion = await provider.complete(messages, {
    maxTokens: options.maxTokens ?? 400,
    ...(options.model ? { model: options.model } : {})
  });
  return { raw: completion.content, model: completion.model };
}
