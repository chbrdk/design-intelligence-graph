import { createId, sha256 } from "./io.js";

export interface MatchableNode {
  node_id: string;
  parent_node_id?: string | null;
  node_type?: string;
  tag?: string;
  dom_path?: string;
  text?: string;
  sibling_index?: number;
  rendered?: boolean;
  source_anchor?: Record<string, string>;
  attributes?: Record<string, string>;
  pseudo_type?: "::before" | "::after";
}

export interface ViewportNodeSet {
  viewport_capture_id: string;
  viewport_name: string;
  nodes: MatchableNode[];
}

export interface LogicalElementMember {
  viewport_capture_id: string;
  viewport_name: string;
  node_id: string;
}

export interface LogicalElement {
  logical_element_id: string;
  match_confidence: number;
  match_method: "stable_anchor" | "structure_and_text" | "structure";
  fingerprint_hash: string;
  members: LogicalElementMember[];
  provenance: { layer: "L2"; method: string; confidence: number };
}

const STRONG_ANCHORS = ["id", "data-testid", "data-test", "name"] as const;
const SUPPORTING_ANCHORS = ["aria-label", "role", "href"] as const;

function normalizedText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase().slice(0, 160);
}

function fingerprint(node: MatchableNode): { value: string; method: LogicalElement["match_method"]; confidence: number } | null {
  if (!node.node_id || node.node_type !== "element" || !node.tag) return null;
  const anchors = node.source_anchor ?? {};
  for (const name of STRONG_ANCHORS) {
    const value = anchors[name]?.trim();
    if (value) return { value: `${node.tag}|${name}:${value}`, method: "stable_anchor", confidence: 0.98 };
  }
  const supporting = SUPPORTING_ANCHORS.flatMap((name) => anchors[name] ? [`${name}:${anchors[name]}`] : []);
  const text = normalizedText(node.text);
  if (node.dom_path && (text || supporting.length)) {
    return {
      value: `${node.tag}|${node.dom_path}|${supporting.join("|")}|${text}`,
      method: "structure_and_text",
      confidence: 0.9
    };
  }
  if (node.dom_path) return { value: `${node.tag}|${node.dom_path}`, method: "structure", confidence: 0.8 };
  return null;
}

export function matchLogicalElements(viewports: ViewportNodeSet[]): LogicalElement[] {
  const groups = new Map<string, { method: LogicalElement["match_method"]; confidence: number; members: LogicalElementMember[] }>();
  for (const viewport of viewports) {
    const seenInViewport = new Set<string>();
    for (const node of viewport.nodes) {
      const candidate = fingerprint(node);
      if (!candidate || seenInViewport.has(candidate.value)) continue;
      seenInViewport.add(candidate.value);
      const group = groups.get(candidate.value) ?? { method: candidate.method, confidence: candidate.confidence, members: [] };
      group.members.push({ viewport_capture_id: viewport.viewport_capture_id, viewport_name: viewport.viewport_name, node_id: node.node_id });
      groups.set(candidate.value, group);
    }
  }

  return [...groups.entries()]
    .filter(([, group]) => new Set(group.members.map((member) => member.viewport_capture_id)).size >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      logical_element_id: createId("lel"),
      match_confidence: group.confidence,
      match_method: group.method,
      fingerprint_hash: sha256(key),
      members: group.members,
      provenance: { layer: "L2", method: `cross_viewport_${group.method}`, confidence: group.confidence }
    }));
}
