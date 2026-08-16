/**
 * DIG-011 Phase A — recognize flow transition candidates (no navigation).
 * Spec: docs/DIG-011-phase-a-recognize.md
 */

import { createHash } from "node:crypto";
import { writeArtifact } from "./io.js";
import type { MatchableNode } from "./matching.js";
import type { MeasuredBox } from "./responsive.js";
import type { ArtifactReference } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";

export const FLOW_CANDIDATES_VERSION = "0.1.0";
export const FLOW_CANDIDATES_RELATIVE_PATH = "derived/flow-candidates.json";

export type FlowControlKind = "link" | "button" | "nav_item" | "tab" | "submit" | "other";
export type FlowDestinationClass =
  | "internal_same_origin"
  | "internal_path"
  | "external"
  | "fragment"
  | "action_unsafe"
  | "unknown";
export type FlowCandidateSafety = "allow_activate" | "href_join_only" | "forbid";

export interface FlowCandidateEvidence {
  kind: string;
  fact: string;
  value?: unknown;
}

export interface FlowCandidate {
  candidate_id: string;
  node_id: string;
  viewport_capture_id: string;
  control_kind: FlowControlKind;
  destination: string | null;
  destination_class: FlowDestinationClass;
  candidacy_score: number;
  hotspot_box?: { x: number; y: number; width: number; height: number; space: "document" | "viewport" };
  safety: FlowCandidateSafety;
  layer: "L2";
  method: string;
  evidence: FlowCandidateEvidence[];
}

export interface FlowCandidatesDocument {
  schema_version: "0.1.0";
  capture_run_id: string;
  generated_at: string;
  candidates: FlowCandidate[];
}

export interface FlowCandidateViewportInput {
  viewport_capture_id: string;
  viewport_name: string;
  page_url: string;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
}

const UNSAFE_HREF =
  /^(mailto:|tel:|sms:|javascript:|data:)/i;
const UNSAFE_PATH =
  /\/(logout|log-out|signout|sign-out|delete|destroy|purchase|checkout|pay|billing|password|reset-password|download)\b/i;
const UNSAFE_TEXT =
  /\b(log\s*out|sign\s*out|delete account|purchase|buy now|pay now|download)\b/i;
const COOKIE_FOOTER =
  /\b(cookie|consent|privacy|impressum|legal|datenschutz|agb)\b/i;

function stableId(prefix: string, parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function accessibleName(node: MatchableNode): string {
  const attrs = node.attributes ?? {};
  return (
    attrs["aria-label"] ||
    attrs["aria-labelledby"] ||
    attrs.title ||
    node.text ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function tagOf(node: MatchableNode): string {
  return (node.tag || "").toLowerCase();
}

function roleOf(node: MatchableNode): string {
  return (node.attributes?.role || "").toLowerCase();
}

function hrefOf(node: MatchableNode): string | null {
  const raw = node.attributes?.href || node.source_anchor?.href || "";
  const trimmed = raw.trim();
  return trimmed || null;
}

function inNavContext(node: MatchableNode, byId: Map<string, MatchableNode>): boolean {
  let current: MatchableNode | undefined = node;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    const tag = tagOf(current);
    const role = roleOf(current);
    if (tag === "nav" || role === "navigation" || role === "menubar") return true;
    const parentId = current.parent_node_id;
    if (!parentId) break;
    current = byId.get(parentId);
  }
  return false;
}

function inMainLandmark(node: MatchableNode, byId: Map<string, MatchableNode>): boolean {
  let current: MatchableNode | undefined = node;
  for (let depth = 0; depth < 12 && current; depth += 1) {
    const tag = tagOf(current);
    const role = roleOf(current);
    if (tag === "main" || role === "main") return true;
    const parentId = current.parent_node_id;
    if (!parentId) break;
    current = byId.get(parentId);
  }
  return false;
}

function inFooter(node: MatchableNode, byId: Map<string, MatchableNode>): boolean {
  let current: MatchableNode | undefined = node;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const tag = tagOf(current);
    const role = roleOf(current);
    if (tag === "footer" || role === "contentinfo") return true;
    const parentId = current.parent_node_id;
    if (!parentId) break;
    current = byId.get(parentId);
  }
  return false;
}

export function classifyDestination(
  href: string | null,
  pageUrl: string
): { destination: string | null; destination_class: FlowDestinationClass; unsafeReason?: string } {
  if (!href) return { destination: null, destination_class: "unknown" };
  if (UNSAFE_HREF.test(href)) {
    return { destination: null, destination_class: "action_unsafe", unsafeReason: "scheme" };
  }
  if (href.startsWith("#")) {
    return { destination: href.slice(0, 120), destination_class: "fragment" };
  }

  let resolved: URL;
  try {
    resolved = new URL(href, pageUrl);
  } catch {
    return { destination: null, destination_class: "unknown" };
  }

  if (UNSAFE_PATH.test(resolved.pathname) || /\.(zip|exe|dmg|pkg|msi)(\?|$)/i.test(resolved.pathname)) {
    return {
      destination: sanitizeFlowDestination(resolved),
      destination_class: "action_unsafe",
      unsafeReason: "path"
    };
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return { destination: null, destination_class: "action_unsafe", unsafeReason: "protocol" };
  }

  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return { destination: sanitizeFlowDestination(resolved), destination_class: "unknown" };
  }

  const dest = sanitizeFlowDestination(resolved);
  if (
    resolved.origin === page.origin &&
    resolved.pathname === page.pathname &&
    resolved.hash &&
    !resolved.search
  ) {
    return {
      destination: `${resolved.pathname}${resolved.hash}`.slice(0, 200),
      destination_class: "fragment"
    };
  }

  if (resolved.origin === page.origin) {
    if (resolved.pathname === page.pathname) {
      return { destination: dest, destination_class: "internal_same_origin" };
    }
    return { destination: dest, destination_class: "internal_path" };
  }

  return { destination: dest, destination_class: "external" };
}

/** Sanitize destination for storage: redact query values, keep path; keep hash for fragments. */
export function sanitizeFlowDestination(url: URL): string {
  const copy = new URL(url.toString());
  const keys = [...copy.searchParams.keys()];
  copy.search = "";
  for (const key of keys) copy.searchParams.append(key, "[redacted]");
  return copy.toString();
}

function controlKind(node: MatchableNode, nav: boolean): FlowControlKind {
  const tag = tagOf(node);
  const role = roleOf(node);
  const type = (node.attributes?.type || "").toLowerCase();
  if (role === "tab") return "tab";
  if (tag === "a" || role === "link") return nav ? "nav_item" : "link";
  if (tag === "button" || role === "button") {
    if (type === "submit") return "submit";
    return "button";
  }
  if (tag === "input" && (type === "submit" || type === "button" || type === "image")) {
    return type === "submit" ? "submit" : "button";
  }
  return "other";
}

function isInteractiveCandidate(node: MatchableNode): boolean {
  if (node.node_type && node.node_type !== "element") return false;
  if (node.rendered === false) return false;
  const tag = tagOf(node);
  const role = roleOf(node);
  if (tag === "a" && hrefOf(node)) return true;
  if (tag === "button") return true;
  if (tag === "input") {
    const type = (node.attributes?.type || "").toLowerCase();
    return type === "submit" || type === "button" || type === "image";
  }
  if (role === "link" || role === "button" || role === "tab" || role === "menuitem") return true;
  return false;
}

function scoreCandidate(input: {
  control_kind: FlowControlKind;
  destination_class: FlowDestinationClass;
  name: string;
  inMain: boolean;
  inFooter: boolean;
  nav: boolean;
  rendered: boolean;
  box?: MeasuredBox;
  viewportHeight: number;
}): number {
  let score = 0.35;
  if (input.destination_class === "internal_path") score += 0.28;
  if (input.destination_class === "internal_same_origin") score += 0.12;
  if (input.destination_class === "fragment") score += 0.08;
  if (input.destination_class === "external") score -= 0.12;
  if (input.destination_class === "action_unsafe") score = 0.05;
  if (input.destination_class === "unknown") score -= 0.05;

  if (input.control_kind === "link" || input.control_kind === "nav_item") score += 0.08;
  if (input.control_kind === "button" || input.control_kind === "submit") score += 0.05;
  if (input.control_kind === "tab") score += 0.04;

  if (input.inMain) score += 0.12;
  if (input.nav) score += 0.06;
  if (input.inFooter) score -= 0.2;
  if (COOKIE_FOOTER.test(input.name)) score -= 0.25;
  if (input.name.length >= 2) score += 0.06;
  if (input.rendered !== false) score += 0.04;

  const bbox = input.box?.bbox;
  if (bbox && input.viewportHeight > 0) {
    if (bbox.y < input.viewportHeight * 1.1) score += 0.08;
    if (bbox.width * bbox.height > 4000) score += 0.03;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function safetyFor(
  destination_class: FlowDestinationClass,
  name: string,
  control_kind: FlowControlKind
): FlowCandidateSafety {
  if (destination_class === "action_unsafe") return "forbid";
  if (UNSAFE_TEXT.test(name)) return "forbid";
  if (destination_class === "external") return "href_join_only";
  if (destination_class === "fragment") return "href_join_only";
  if (control_kind === "link" || control_kind === "nav_item") return "href_join_only";
  if (destination_class === "internal_path" || destination_class === "internal_same_origin") {
    return "allow_activate";
  }
  return "href_join_only";
}

export function deriveFlowCandidates(input: {
  captureRunId: string;
  viewports: FlowCandidateViewportInput[];
  generatedAt?: string;
  maxCandidates?: number;
}): FlowCandidatesDocument {
  const paths = loadDigPaths() as { flowCandidates?: { maxCandidates?: number } };
  const maxCandidates = input.maxCandidates ?? paths.flowCandidates?.maxCandidates ?? 80;
  const candidates: FlowCandidate[] = [];

  for (const viewport of input.viewports) {
    const byId = new Map(viewport.nodes.map((node) => [node.node_id, node]));
    const boxesById = new Map(viewport.boxes.map((box) => [box.node_id, box]));
    const viewportHeight =
      Math.max(
        0,
        ...viewport.boxes.map((box) => (box.bbox ? box.bbox.y + box.bbox.height : 0))
      ) || 900;

    for (const node of viewport.nodes) {
      if (!isInteractiveCandidate(node)) continue;
      const href = hrefOf(node);
      const name = accessibleName(node);
      if (UNSAFE_TEXT.test(name) && !href) {
        // bare destructive button
      }
      const nav = inNavContext(node, byId);
      const kind = controlKind(node, nav);
      let classified = classifyDestination(href, viewport.page_url);
      if (classified.destination_class === "unknown" && kind === "other" && !href) continue;
      if (!href && kind !== "button" && kind !== "submit" && kind !== "tab") continue;

      if (UNSAFE_TEXT.test(name) && classified.destination_class !== "action_unsafe") {
        classified = {
          ...classified,
          destination_class: "action_unsafe",
          unsafeReason: "label"
        };
      }

      const box = boxesById.get(node.node_id);
      const score = scoreCandidate({
        control_kind: kind,
        destination_class: classified.destination_class,
        name,
        inMain: inMainLandmark(node, byId),
        inFooter: inFooter(node, byId),
        nav,
        rendered: node.rendered !== false,
        ...(box ? { box } : {}),
        viewportHeight
      });
      const safety = safetyFor(classified.destination_class, name, kind);
      const evidence: FlowCandidateEvidence[] = [];
      if (href) evidence.push({ kind: "attribute", fact: "href", value: href.slice(0, 200) });
      if (name) evidence.push({ kind: "text", fact: "accessible_name", value: name });
      if (nav) evidence.push({ kind: "structure", fact: "nav_ancestor" });
      if (classified.unsafeReason) {
        evidence.push({ kind: "safety", fact: "unsafe_reason", value: classified.unsafeReason });
      }

      const candidate: FlowCandidate = {
        candidate_id: stableId("cand", [viewport.viewport_capture_id, node.node_id, kind]),
        node_id: node.node_id,
        viewport_capture_id: viewport.viewport_capture_id,
        control_kind: kind,
        destination: classified.destination,
        destination_class: classified.destination_class,
        candidacy_score: score,
        safety,
        layer: "L2",
        method: href ? "link_href_scan" : "control_role_scan",
        evidence
      };
      if (box?.bbox) {
        candidate.hotspot_box = {
          x: box.bbox.x,
          y: box.bbox.y,
          width: box.bbox.width,
          height: box.bbox.height,
          space: "document"
        };
      }
      candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => {
    if (b.candidacy_score !== a.candidacy_score) return b.candidacy_score - a.candidacy_score;
    return a.node_id.localeCompare(b.node_id);
  });

  return {
    schema_version: "0.1.0",
    capture_run_id: input.captureRunId,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    candidates: candidates.slice(0, maxCandidates)
  };
}

export async function emitFlowCandidatesForPackage(
  packageRoot: string,
  input: {
    captureRunId: string;
    viewports: FlowCandidateViewportInput[];
  }
): Promise<{ path: string; artifact: ArtifactReference; document: FlowCandidatesDocument } | null> {
  if (!input.viewports.some((viewport) => viewport.nodes.length > 0)) return null;
  const document = deriveFlowCandidates(input);
  const relative =
    (loadDigPaths() as { flowCandidates?: { relativePath?: string } }).flowCandidates?.relativePath ??
    FLOW_CANDIDATES_RELATIVE_PATH;
  const artifact = await writeArtifact(packageRoot, relative, JSON.stringify(document, null, 2), "application/json");
  return { path: relative, artifact, document };
}
