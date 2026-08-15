import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensureDirectory, sha256, writeArtifact } from "./io.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import { verifyCapturePackage } from "./verify.js";

export const STORAGE_MODEL_VERSION = "0.1.0";

export interface KnowledgeNode { node_id: string; type: "site" | "page" | "capture_run" | "viewport" | "ontology_entity" | "logical_element" | "analysis_finding" | "semantic_hypothesis"; label: string; properties: Record<string, unknown>; }
export interface KnowledgeEdge { edge_id: string; type: string; from_node_id: string; to_node_id: string; properties: Record<string, unknown>; }
export interface KnowledgeGraph { schema_version: string; storage_model_version: string; source_capture_run_id: string; indexed_at: string; nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; lineage: Array<{ artifact_path: string; sha256: string; bytes: number; media_type: string }>; }

const id = (prefix: string, value: string) => `${prefix}_${sha256(value).slice(7, 27)}`;

function allArtifacts(manifest: CaptureManifest): ArtifactReference[] {
  return [...Object.values(manifest.run_artifacts), ...manifest.viewport_captures.flatMap((viewport) => Object.values(viewport.artifacts))];
}

export function deriveKnowledgeGraph(input: { manifest: CaptureManifest; ontology: { viewports?: Array<{ viewport_capture_id: string; entities?: Array<{ ontology_entity_id: string; taxonomy_id: string; label: string; parent_entity_id: string | null; logical_element_id?: string; confidence: number; layer: string; method: string }>; relationships?: Array<{ relationship_id: string; type: string; from_entity_id: string; to_entity_id: string; confidence: number; layer: string }> }> }; logical: { logical_elements?: Array<{ logical_element_id: string; members: Array<{ viewport_capture_id: string; node_id: string }>; match_confidence: number; match_method: string }> }; analysis: { findings?: Array<{ finding_id: string; kind: string; value: number; unit: string; confidence: number; method: string }>; semantic_inputs?: Array<{ source: string; source_id: string; viewport_capture_id: string; confidence: number; method: string }> } }): KnowledgeGraph {
  const { manifest } = input;
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  const addNode = (node: KnowledgeNode) => { if (!nodes.some((item) => item.node_id === node.node_id)) nodes.push(node); };
  const addEdge = (type: string, from: string, to: string, properties: Record<string, unknown> = {}) => edges.push({ edge_id: id("kge", `${type}|${from}|${to}|${JSON.stringify(properties)}`), type, from_node_id: from, to_node_id: to, properties });
  const siteId = manifest.site.site_id, pageId = manifest.page.page_id, runId = manifest.capture_run_id;
  addNode({ node_id: siteId, type: "site", label: manifest.site.domain, properties: manifest.site });
  addNode({ node_id: pageId, type: "page", label: manifest.page.route, properties: manifest.page });
  addNode({ node_id: runId, type: "capture_run", label: runId, properties: { status: manifest.status, completed_at: manifest.completed_at } });
  addEdge("contains", siteId, pageId); addEdge("captured_in", pageId, runId);
  for (const viewport of manifest.viewport_captures) {
    const viewportNodeId = `viewport_${viewport.viewport_capture_id}`;
    addNode({ node_id: viewportNodeId, type: "viewport", label: viewport.name, properties: { viewport_capture_id: viewport.viewport_capture_id, ...viewport.viewport, ...viewport.document, status: viewport.status } });
    addEdge("observed_at", runId, viewportNodeId);
  }
  for (const element of input.logical.logical_elements ?? []) {
    addNode({ node_id: element.logical_element_id, type: "logical_element", label: element.logical_element_id, properties: { match_confidence: element.match_confidence, match_method: element.match_method, member_count: element.members.length } });
    addEdge("identified_in", runId, element.logical_element_id);
  }
  for (const viewport of input.ontology.viewports ?? []) for (const entity of viewport.entities ?? []) {
    addNode({ node_id: entity.ontology_entity_id, type: "ontology_entity", label: entity.label, properties: { taxonomy_id: entity.taxonomy_id, viewport_capture_id: viewport.viewport_capture_id, confidence: entity.confidence, layer: entity.layer, method: entity.method } });
    addEdge("observed_at", entity.ontology_entity_id, `viewport_${viewport.viewport_capture_id}`);
    if (entity.parent_entity_id) addEdge("contains", entity.parent_entity_id, entity.ontology_entity_id);
    if (entity.logical_element_id) addEdge("instantiates", entity.logical_element_id, entity.ontology_entity_id);
  }
  for (const viewport of input.ontology.viewports ?? []) for (const relation of viewport.relationships ?? []) addEdge(relation.type, relation.from_entity_id, relation.to_entity_id, { confidence: relation.confidence, layer: relation.layer });
  for (const finding of input.analysis.findings ?? []) {
    const findingNodeId = `finding_${finding.finding_id}`;
    addNode({ node_id: findingNodeId, type: "analysis_finding", label: finding.kind, properties: finding }); addEdge("analyzed_in", runId, findingNodeId);
  }
  for (const semantic of input.analysis.semantic_inputs ?? []) {
    const semanticNodeId = `semantic_${semantic.source}_${semantic.source_id}`;
    addNode({ node_id: semanticNodeId, type: "semantic_hypothesis", label: semantic.source_id, properties: semantic }); addEdge("derived_from", semanticNodeId, `viewport_${semantic.viewport_capture_id}`);
  }
  const lineage = allArtifacts(manifest).map((artifact) => ({ artifact_path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes, media_type: artifact.media_type })).sort((a, b) => a.artifact_path.localeCompare(b.artifact_path));
  return { schema_version: "0.1.0", storage_model_version: STORAGE_MODEL_VERSION, source_capture_run_id: runId, indexed_at: new Date().toISOString(), nodes: nodes.sort((a, b) => a.node_id.localeCompare(b.node_id)), edges: edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id)), lineage };
}

export async function indexCapturePackage(packageRoot: string, outputDirectory: string): Promise<{ indexRoot: string; graph: KnowledgeGraph }> {
  const verification = await verifyCapturePackage(packageRoot);
  if (!verification.valid) throw new Error(`Capture package is invalid: ${verification.issues.map((issue) => issue.code).join(", ")}`);
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
  const readRunArtifact = async <T>(key: string): Promise<T> => JSON.parse(await readFile(resolve(packageRoot, manifest.run_artifacts[key]!.path), "utf8")) as T;
  const [ontology, logical, analysis] = await Promise.all([readRunArtifact<Parameters<typeof deriveKnowledgeGraph>[0]["ontology"]>("ontology"), readRunArtifact<Parameters<typeof deriveKnowledgeGraph>[0]["logical"]>("logical_elements"), readRunArtifact<Parameters<typeof deriveKnowledgeGraph>[0]["analysis"]>("analysis")]);
  const graph = deriveKnowledgeGraph({ manifest, ontology, logical, analysis });
  const indexRoot = resolve(outputDirectory, `${manifest.capture_run_id}`);
  await ensureDirectory(indexRoot);
  const graphArtifact = await writeArtifact(indexRoot, "graph.json", JSON.stringify(graph, null, 2), "application/json");
  await writeArtifact(indexRoot, "index-manifest.json", JSON.stringify({ schema_version: "0.1.0", storage_model_version: STORAGE_MODEL_VERSION, source_package: resolve(packageRoot), source_capture_run_id: manifest.capture_run_id, graph: graphArtifact }, null, 2), "application/json");
  return { indexRoot, graph };
}

export function searchKnowledgeGraph(graph: KnowledgeGraph, query: string, limit = 20): KnowledgeNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return graph.nodes.filter((node) => `${node.node_id} ${node.type} ${node.label} ${JSON.stringify(node.properties)}`.toLocaleLowerCase().includes(needle)).slice(0, Math.max(0, limit));
}
