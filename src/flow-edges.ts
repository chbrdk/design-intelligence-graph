/**
 * DIG-011 Phase B — measure flow transition edges (B1 href-join, B2 seed, B3 refuse, B4 import).
 * Spec: docs/DIG-011-phase-b-measure.md
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { writeArtifact } from "./io.js";
import type { FlowCandidate, FlowCandidatesDocument } from "./flow-candidates.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";

export const FLOW_EDGES_VERSION = "0.1.0";
export const FLOW_EDGES_RELATIVE_PATH = "derived/flow-edges.json";
export const FLOW_EDGES_JSONL_RELATIVE_PATH = "derived/flow-edges.jsonl";
export const FLOW_EDGES_LOCAL_JSONL_RELATIVE_PATH = "derived/flow-edges.local.jsonl";

export type FlowEdgeActivation = "none" | "observed" | "inferred_href_only";
export type FlowEdgeMethod =
  | "href_join"
  | "seed_sequence"
  | "safe_activate"
  | "external_import"
  | "manual";

export interface FlowEdgeTrigger {
  kind:
    | "href"
    | "same_document"
    | "spa_route"
    | "safe_activate"
    | "external_import"
    | "manual"
    | "seed_sequence";
  node_id?: string | null;
  href?: string | null;
  destination_url?: string | null;
  candidate_id?: string | null;
}

export interface FlowEdge {
  edge_id: string;
  from_capture_run_id: string;
  to_capture_run_id: string;
  from_screen_id?: string;
  to_screen_id?: string;
  trigger: FlowEdgeTrigger;
  hotspot?: { x: number; y: number; width: number; height: number; space: "document" | "viewport" };
  activation: FlowEdgeActivation;
  method: FlowEdgeMethod;
  confidence: number;
  provenance: { layer: "L1" | "L2"; evidence_refs?: string[] };
}

export interface FlowEdgesDocument {
  schema_version: "0.1.0";
  app_scope_id: string;
  flow_session_id: string | null;
  edges: FlowEdge[];
}

export interface FlowScreenRef {
  capture_run_id: string;
  canonical_url: string;
  screen_id?: string;
  candidates?: FlowCandidate[];
  package_root?: string;
}

function stableId(prefix: string, parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

/** Join key: lowercase host, strip default ports, strip trailing slash except `/`, drop hash. */
export function normalizeFlowJoinUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.username = "";
    url.password = "";
    const host = url.hostname.toLowerCase();
    const port =
      url.port &&
      !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))
        ? `:${url.port}`
        : "";
    let path = url.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    // Drop query for join key (secrets already redacted in stored URLs).
    return `${url.protocol}//${host}${port}${path}`;
  } catch {
    return null;
  }
}

function candidateHref(candidate: FlowCandidate): string | null {
  const hrefEv = candidate.evidence.find((item) => item.kind === "attribute" && item.fact === "href");
  if (typeof hrefEv?.value === "string" && hrefEv.value.trim()) return hrefEv.value.trim();
  return candidate.destination;
}

function clampConfidence(value: number, maxExclusive = 0.999): number {
  return Math.max(0, Math.min(maxExclusive, Number(value.toFixed(4))));
}

export function hrefJoinEdges(input: {
  appScopeId: string;
  flowSessionId?: string | null;
  screens: FlowScreenRef[];
}): FlowEdgesDocument {
  const byJoin = new Map<string, FlowScreenRef[]>();
  for (const screen of input.screens) {
    const key = normalizeFlowJoinUrl(screen.canonical_url);
    if (!key) continue;
    const list = byJoin.get(key) ?? [];
    list.push(screen);
    byJoin.set(key, list);
  }

  const edges: FlowEdge[] = [];
  for (const from of input.screens) {
    for (const candidate of from.candidates ?? []) {
      if (candidate.safety === "forbid") continue;
      if (
        candidate.destination_class === "action_unsafe" ||
        candidate.destination_class === "fragment" ||
        candidate.destination_class === "unknown"
      ) {
        continue;
      }
      const destRaw = candidate.destination || candidateHref(candidate);
      if (!destRaw) continue;
      let resolved: string;
      try {
        resolved = new URL(destRaw, from.canonical_url).toString();
      } catch {
        continue;
      }
      const joinKey = normalizeFlowJoinUrl(resolved);
      if (!joinKey) continue;
      const targets = (byJoin.get(joinKey) ?? []).filter(
        (screen) => screen.capture_run_id !== from.capture_run_id
      );
      if (!targets.length) continue;
      // Prefer first stable target (deterministic by capture_run_id).
      targets.sort((a, b) => a.capture_run_id.localeCompare(b.capture_run_id));
      const to = targets[0]!;
      const href = candidateHref(candidate);
      const confidence = clampConfidence(Math.min(0.95, 0.55 + candidate.candidacy_score * 0.4));
      const edge: FlowEdge = {
        edge_id: stableId("fe", [from.capture_run_id, to.capture_run_id, candidate.candidate_id]),
        from_capture_run_id: from.capture_run_id,
        to_capture_run_id: to.capture_run_id,
        trigger: {
          kind: "href",
          node_id: candidate.node_id,
          href: href,
          destination_url: candidate.destination ?? normalizeFlowJoinUrl(resolved),
          candidate_id: candidate.candidate_id
        },
        activation: "inferred_href_only",
        method: "href_join",
        confidence,
        provenance: {
          layer: "L2",
          evidence_refs: [`candidates#${candidate.candidate_id}`]
        }
      };
      if (from.screen_id) edge.from_screen_id = from.screen_id;
      if (to.screen_id) edge.to_screen_id = to.screen_id;
      if (candidate.hotspot_box) edge.hotspot = { ...candidate.hotspot_box };
      edges.push(edge);
    }
  }

  edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  return {
    schema_version: "0.1.0",
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? null,
    edges
  };
}

export function seedSequenceEdges(input: {
  appScopeId: string;
  flowSessionId?: string | null;
  seedSource: string;
  seedRef?: string;
  /** Ordered seed URLs with matched CaptureRuns */
  steps: Array<{ url: string; capture_run_id: string; screen_id?: string }>;
  /** Optional href proof: if consecutive step has matching candidate, boost confidence */
  screens?: FlowScreenRef[];
}): FlowEdgesDocument {
  const edges: FlowEdge[] = [];
  const byId = new Map((input.screens ?? []).map((screen) => [screen.capture_run_id, screen]));

  for (let index = 0; index < input.steps.length - 1; index += 1) {
    const from = input.steps[index]!;
    const to = input.steps[index + 1]!;
    if (from.capture_run_id === to.capture_run_id) continue;

    let confidence = 0.8;
    let hrefProof: FlowCandidate | null = null;
    const fromScreen = byId.get(from.capture_run_id);
    if (fromScreen?.candidates?.length) {
      const toKey = normalizeFlowJoinUrl(to.url);
      for (const candidate of fromScreen.candidates) {
        if (candidate.safety === "forbid") continue;
        const dest = candidate.destination || candidateHref(candidate);
        if (!dest) continue;
        try {
          const resolved = normalizeFlowJoinUrl(new URL(dest, fromScreen.canonical_url).toString());
          if (resolved && toKey && resolved === toKey) {
            hrefProof = candidate;
            confidence = clampConfidence(Math.min(0.92, 0.8 + candidate.candidacy_score * 0.12));
            break;
          }
        } catch {
          /* ignore */
        }
      }
    } else {
      confidence = clampConfidence(0.8);
    }

    const edge: FlowEdge = {
      edge_id: stableId("fe", ["seed", from.capture_run_id, to.capture_run_id, String(index)]),
      from_capture_run_id: from.capture_run_id,
      to_capture_run_id: to.capture_run_id,
      trigger: {
        kind: "seed_sequence",
        node_id: hrefProof?.node_id ?? null,
        href: hrefProof ? candidateHref(hrefProof) : null,
        destination_url: to.url,
        candidate_id: hrefProof?.candidate_id ?? null
      },
      activation: hrefProof ? "inferred_href_only" : "none",
      method: "seed_sequence",
      confidence: hrefProof
        ? clampConfidence(Math.min(0.92, confidence))
        : clampConfidence(Math.min(0.85, confidence), 0.85),
      provenance: {
        layer: "L2",
        evidence_refs: [
          `seed:${input.seedSource}${input.seedRef ? `:${input.seedRef}` : ""}:pages[${index + 1}]`
        ]
      }
    };
    if (from.screen_id) edge.from_screen_id = from.screen_id;
    if (to.screen_id) edge.to_screen_id = to.screen_id;
    if (hrefProof?.hotspot_box) edge.hotspot = { ...hrefProof.hotspot_box };
    edges.push(edge);
  }

  return {
    schema_version: "0.1.0",
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? null,
    edges
  };
}

/** B3: refuse forbidden candidates; build observed edge only when caller already captured destination safely. */
export function assertSafeActivateAllowed(candidate: Pick<FlowCandidate, "safety" | "destination_class">): {
  ok: boolean;
  reason?: string;
} {
  if (candidate.safety === "forbid") return { ok: false, reason: "safety_forbid" };
  if (candidate.destination_class === "action_unsafe") return { ok: false, reason: "action_unsafe" };
  if (candidate.safety !== "allow_activate") return { ok: false, reason: "not_allow_activate" };
  return { ok: true };
}

export function buildSafeActivateEdge(input: {
  fromCaptureRunId: string;
  toCaptureRunId: string;
  candidate: FlowCandidate;
  fromScreenId?: string;
  toScreenId?: string;
}): FlowEdge | null {
  const allowed = assertSafeActivateAllowed(input.candidate);
  if (!allowed.ok) return null;
  const edge: FlowEdge = {
    edge_id: stableId("fe", [
      "activate",
      input.fromCaptureRunId,
      input.toCaptureRunId,
      input.candidate.candidate_id
    ]),
    from_capture_run_id: input.fromCaptureRunId,
    to_capture_run_id: input.toCaptureRunId,
    trigger: {
      kind: "safe_activate",
      node_id: input.candidate.node_id,
      href: candidateHref(input.candidate),
      destination_url: input.candidate.destination,
      candidate_id: input.candidate.candidate_id
    },
    activation: "observed",
    method: "safe_activate",
    confidence: 1,
    provenance: {
      layer: "L1",
      evidence_refs: [`safe_activate#${input.candidate.candidate_id}`]
    }
  };
  if (input.fromScreenId) edge.from_screen_id = input.fromScreenId;
  if (input.toScreenId) edge.to_screen_id = input.toScreenId;
  if (input.candidate.hotspot_box) edge.hotspot = { ...input.candidate.hotspot_box };
  return edge;
}

export function importExternalEdges(input: {
  appScopeId: string;
  flowSessionId?: string | null;
  edges: Array<Omit<FlowEdge, "method" | "trigger"> & { trigger?: Partial<FlowEdgeTrigger> }>;
}): FlowEdgesDocument {
  const edges: FlowEdge[] = input.edges.map((edge, index) => ({
    ...edge,
    edge_id: edge.edge_id || stableId("fe", ["import", String(index), edge.from_capture_run_id, edge.to_capture_run_id]),
    method: "external_import",
    trigger: {
      kind: "external_import",
      node_id: edge.trigger?.node_id ?? null,
      href: edge.trigger?.href ?? null,
      destination_url: edge.trigger?.destination_url ?? null,
      candidate_id: edge.trigger?.candidate_id ?? null
    },
    confidence: clampConfidence(Math.min(edge.confidence, 0.99)),
    provenance: edge.provenance ?? { layer: "L2", evidence_refs: ["external_import"] }
  }));
  return {
    schema_version: "0.1.0",
    app_scope_id: input.appScopeId,
    flow_session_id: input.flowSessionId ?? null,
    edges
  };
}

export function mergeFlowEdgesDocuments(docs: FlowEdgesDocument[]): FlowEdgesDocument {
  if (!docs.length) {
    return { schema_version: "0.1.0", app_scope_id: "app_unknown", flow_session_id: null, edges: [] };
  }
  const seen = new Set<string>();
  const edges: FlowEdge[] = [];
  for (const doc of docs) {
    for (const edge of doc.edges) {
      if (seen.has(edge.edge_id)) continue;
      seen.add(edge.edge_id);
      edges.push(edge);
    }
  }
  edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id));
  return {
    schema_version: "0.1.0",
    app_scope_id: docs[0]!.app_scope_id,
    flow_session_id: docs[0]!.flow_session_id,
    edges
  };
}

export function flowEdgesToJsonl(document: FlowEdgesDocument): string {
  return `${document.edges.map((edge) => JSON.stringify(edge)).join("\n")}${document.edges.length ? "\n" : ""}`;
}

export async function emitFlowEdgesDocument(
  packageOrScopeRoot: string,
  document: FlowEdgesDocument,
  options: { localOnly?: boolean } = {}
): Promise<{ json: ArtifactReference; jsonl: ArtifactReference; document: FlowEdgesDocument }> {
  const paths = loadDigPaths() as {
    flowEdges?: { relativePath?: string; jsonlRelativePath?: string; localJsonlRelativePath?: string };
  };
  const jsonPath = options.localOnly
    ? undefined
    : (paths.flowEdges?.relativePath ?? FLOW_EDGES_RELATIVE_PATH);
  const jsonlPath = options.localOnly
    ? (paths.flowEdges?.localJsonlRelativePath ?? FLOW_EDGES_LOCAL_JSONL_RELATIVE_PATH)
    : (paths.flowEdges?.jsonlRelativePath ?? FLOW_EDGES_JSONL_RELATIVE_PATH);

  const jsonArtifact = await writeArtifact(
    packageOrScopeRoot,
    jsonPath ?? (options.localOnly ? "derived/flow-edges.local.json" : FLOW_EDGES_RELATIVE_PATH),
    JSON.stringify(document, null, 2),
    "application/json"
  );
  const jsonlArtifact = await writeArtifact(
    packageOrScopeRoot,
    jsonlPath,
    flowEdgesToJsonl(document),
    "application/x-ndjson"
  );
  return { json: jsonArtifact, jsonl: jsonlArtifact, document };
}

export async function loadFlowScreenFromPackage(packageRoot: string): Promise<FlowScreenRef | null> {
  try {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
    let candidates: FlowCandidate[] = [];
    try {
      const candDoc = JSON.parse(
        await readFile(resolve(packageRoot, "derived/flow-candidates.json"), "utf8")
      ) as FlowCandidatesDocument;
      candidates = candDoc.candidates ?? [];
    } catch {
      /* optional */
    }
    return {
      capture_run_id: manifest.capture_run_id,
      canonical_url: manifest.canonical_url,
      candidates,
      package_root: packageRoot,
      screen_id: `fs_${manifest.capture_run_id.replace(/^cap_|^run_/, "").slice(0, 12)}`
    };
  } catch {
    return null;
  }
}

/** Discover sibling packages under the same parent dir with matching site_id (capped). */
export async function discoverSiblingScreens(input: {
  packageRoot: string;
  siteId: string;
  maxPackages?: number;
}): Promise<FlowScreenRef[]> {
  const paths = loadDigPaths() as { flowEdges?: { maxSiblingPackages?: number } };
  const maxPackages = input.maxPackages ?? paths.flowEdges?.maxSiblingPackages ?? 24;
  const parent = dirname(input.packageRoot);
  let entries: string[] = [];
  try {
    entries = await readdir(parent);
  } catch {
    return [];
  }
  const screens: FlowScreenRef[] = [];
  for (const name of entries.sort()) {
    if (screens.length >= maxPackages) break;
    const root = join(parent, name);
    try {
      const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as CaptureManifest;
      if (manifest.site?.site_id !== input.siteId) continue;
      const screen = await loadFlowScreenFromPackage(root);
      if (screen) screens.push(screen);
    } catch {
      /* skip non-packages */
    }
  }
  return screens;
}

export async function emitLocalHrefJoinForPackage(
  packageRoot: string,
  manifest: CaptureManifest
): Promise<{ artifact: ArtifactReference; document: FlowEdgesDocument } | null> {
  const screens = await discoverSiblingScreens({
    packageRoot,
    siteId: manifest.site.site_id
  });
  if (screens.length < 2) return null;
  const document = hrefJoinEdges({
    appScopeId: `app_${manifest.site.site_id}`,
    flowSessionId: null,
    screens
  });
  // Keep edges that touch this package.
  const local: FlowEdgesDocument = {
    ...document,
    edges: document.edges.filter(
      (edge) =>
        edge.from_capture_run_id === manifest.capture_run_id ||
        edge.to_capture_run_id === manifest.capture_run_id
    )
  };
  if (!local.edges.length) return null;
  const emitted = await emitFlowEdgesDocument(packageRoot, local, { localOnly: true });
  return { artifact: emitted.jsonl, document: local };
}
