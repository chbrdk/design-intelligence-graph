import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { sha256 } from "./io.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import { isTaxonomyId, ONTOLOGY_VERSION } from "./taxonomy.js";

export interface VerificationIssue {
  code: string;
  path?: string;
  message: string;
}

export interface VerificationReport {
  valid: boolean;
  package_root: string;
  capture_run_id?: string;
  checked_artifacts: number;
  issues: VerificationIssue[];
}

function isInsideRoot(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function collectArtifacts(manifest: CaptureManifest): Array<{ key: string; artifact: ArtifactReference }> {
  const artifacts = Object.entries(manifest.run_artifacts).map(([key, artifact]) => ({ key: `run_artifacts.${key}`, artifact }));
  for (const viewport of manifest.viewport_captures) {
    for (const [key, artifact] of Object.entries(viewport.artifacts)) {
      artifacts.push({ key: `viewport_captures.${viewport.name}.${key}`, artifact });
    }
  }
  return artifacts;
}

function hasManifestStructure(value: unknown): value is CaptureManifest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.capture_run_id === "string" && typeof record.schema_version === "string" &&
    record.run_artifacts !== null && typeof record.run_artifacts === "object" &&
    Array.isArray(record.viewport_captures) && Array.isArray(record.errors) && Array.isArray(record.interventions);
}

async function readJsonLines(path: string): Promise<Array<Record<string, unknown>>> {
  return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function verifyRelations(packageRoot: string, manifest: CaptureManifest): Promise<VerificationIssue[]> {
  const issues: VerificationIssue[] = [];
  const viewportNames = new Set<string>();
  const viewportIds = new Set<string>();
  const nodeIdsByViewport = new Map<string, Set<string>>();
  for (const viewport of manifest.viewport_captures) {
    if (viewportNames.has(viewport.name)) issues.push({ code: "duplicate_viewport_name", message: viewport.name });
    if (viewportIds.has(viewport.viewport_capture_id)) issues.push({ code: "duplicate_viewport_id", message: viewport.viewport_capture_id });
    viewportNames.add(viewport.name);
    viewportIds.add(viewport.viewport_capture_id);
    const nodesArtifact = viewport.artifacts.nodes;
    if (!nodesArtifact) { issues.push({ code: "nodes_artifact_missing", message: viewport.name }); continue; }
    try {
      const nodes = await readJsonLines(resolve(packageRoot, nodesArtifact.path));
      const nodeIds = new Set<string>();
      for (const node of nodes) {
        const nodeId = node.node_id;
        if (typeof nodeId !== "string") issues.push({ code: "node_id_missing", path: nodesArtifact.path, message: "Node without node_id" });
        else if (nodeIds.has(nodeId)) issues.push({ code: "duplicate_node_id", path: nodesArtifact.path, message: nodeId });
        else nodeIds.add(nodeId);
      }
      for (const node of nodes) {
        const parentId = node.parent_node_id;
        if (typeof parentId === "string" && !nodeIds.has(parentId))
          issues.push({ code: "node_parent_missing", path: nodesArtifact.path, message: `${String(node.node_id)} -> ${parentId}` });
      }
      if (nodes.length !== viewport.node_count)
        issues.push({ code: "node_count_mismatch", path: nodesArtifact.path, message: `Manifest ${viewport.node_count}, file ${nodes.length}` });
      nodeIdsByViewport.set(viewport.viewport_capture_id, nodeIds);
      for (const artifactKey of ["geometry", "computed_styles", "accessibility"] as const) {
        const artifact = viewport.artifacts[artifactKey];
        if (!artifact) continue;
        const records = await readJsonLines(resolve(packageRoot, artifact.path));
        for (const record of records) {
          const referencedId = artifactKey === "accessibility" ? record.dom_node_id : record.node_id;
          if (typeof referencedId === "string" && !nodeIds.has(referencedId))
            issues.push({ code: `${artifactKey}_node_reference_missing`, path: artifact.path, message: referencedId });
        }
      }
    } catch (error) {
      issues.push({ code: "relation_check_failed", path: nodesArtifact.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const logicalArtifact = manifest.run_artifacts.logical_elements;
  const logicalIds = new Set<string>();
  if (logicalArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, logicalArtifact.path), "utf8")) as {
        logical_element_count?: number;
        logical_elements?: Array<{ logical_element_id?: string; members?: Array<{ viewport_capture_id?: string; node_id?: string }> }>;
      };
      const elements = document.logical_elements ?? [];
      if (document.logical_element_count !== elements.length)
        issues.push({ code: "logical_element_count_mismatch", path: logicalArtifact.path, message: `${document.logical_element_count} != ${elements.length}` });
      for (const element of elements) {
        if (!element.logical_element_id) continue;
        logicalIds.add(element.logical_element_id);
        for (const member of element.members ?? []) {
          const nodes = member.viewport_capture_id ? nodeIdsByViewport.get(member.viewport_capture_id) : undefined;
          if (!nodes || !member.node_id || !nodes.has(member.node_id))
            issues.push({ code: "logical_member_reference_missing", path: logicalArtifact.path, message: `${member.viewport_capture_id}:${member.node_id}` });
        }
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const responsiveArtifact = manifest.run_artifacts.responsive_transformations;
  if (responsiveArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, responsiveArtifact.path), "utf8")) as {
        transformation_count?: number; transformations?: Array<{ logical_element_id?: string }>;
      };
      const transformations = document.transformations ?? [];
      if (document.transformation_count !== transformations.length)
        issues.push({ code: "transformation_count_mismatch", path: responsiveArtifact.path, message: `${document.transformation_count} != ${transformations.length}` });
      for (const transformation of transformations) {
        if (!transformation.logical_element_id || !logicalIds.has(transformation.logical_element_id))
          issues.push({ code: "transformation_logical_reference_missing", path: responsiveArtifact.path, message: String(transformation.logical_element_id) });
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const geometryLayoutArtifact = manifest.run_artifacts.geometry_layout;
  if (geometryLayoutArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, geometryLayoutArtifact.path), "utf8")) as {
        geometry_model_version?: string;
        viewports?: Array<{
          viewport_capture_id?: string;
          layout_containers?: Array<{ node_id?: string; child_node_ids?: string[] }>;
          spatial_relationships?: Array<{ relationship_id?: string; from_node_id?: string; to_node_id?: string }>;
        }>;
      };
      if (document.geometry_model_version !== "0.1.0")
        issues.push({ code: "geometry_model_version_unsupported", path: geometryLayoutArtifact.path, message: String(document.geometry_model_version) });
      const relationshipIds = new Set<string>();
      for (const viewport of document.viewports ?? []) {
        const nodeIds = viewport.viewport_capture_id ? nodeIdsByViewport.get(viewport.viewport_capture_id) : undefined;
        if (!viewport.viewport_capture_id || !nodeIds)
          issues.push({ code: "geometry_layout_viewport_missing", path: geometryLayoutArtifact.path, message: String(viewport.viewport_capture_id) });
        for (const container of viewport.layout_containers ?? []) {
          if (!container.node_id || !nodeIds?.has(container.node_id)) issues.push({ code: "geometry_container_node_missing", path: geometryLayoutArtifact.path, message: String(container.node_id) });
          for (const childId of container.child_node_ids ?? []) if (!nodeIds?.has(childId))
            issues.push({ code: "geometry_container_child_missing", path: geometryLayoutArtifact.path, message: `${container.node_id}:${childId}` });
        }
        for (const relationship of viewport.spatial_relationships ?? []) {
          if (!relationship.relationship_id || relationshipIds.has(relationship.relationship_id))
            issues.push({ code: "geometry_relationship_duplicate", path: geometryLayoutArtifact.path, message: String(relationship.relationship_id) });
          if (relationship.relationship_id) relationshipIds.add(relationship.relationship_id);
          if (!relationship.from_node_id || !nodeIds?.has(relationship.from_node_id) || !relationship.to_node_id || !nodeIds?.has(relationship.to_node_id))
            issues.push({ code: "geometry_relationship_node_missing", path: geometryLayoutArtifact.path, message: String(relationship.relationship_id) });
        }
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const responsiveGraphArtifact = manifest.run_artifacts.responsive_layout_graph;
  if (responsiveGraphArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, responsiveGraphArtifact.path), "utf8")) as {
        geometry_model_version?: string;
        nodes?: Array<{ logical_element_id?: string }>;
        edges?: Array<{ edge_id?: string; logical_element_id?: string; from_viewport?: string; to_viewport?: string }>;
      };
      if (document.geometry_model_version !== "0.1.0")
        issues.push({ code: "responsive_graph_version_unsupported", path: responsiveGraphArtifact.path, message: String(document.geometry_model_version) });
      const graphNodes = new Set((document.nodes ?? []).map((node) => node.logical_element_id).filter((id): id is string => Boolean(id)));
      const graphEdgeIds = new Set<string>();
      for (const edge of document.edges ?? []) {
        if (!edge.edge_id || graphEdgeIds.has(edge.edge_id)) issues.push({ code: "responsive_graph_edge_duplicate", path: responsiveGraphArtifact.path, message: String(edge.edge_id) });
        if (edge.edge_id) graphEdgeIds.add(edge.edge_id);
        if (!edge.logical_element_id || !logicalIds.has(edge.logical_element_id) || !graphNodes.has(edge.logical_element_id))
          issues.push({ code: "responsive_graph_logical_reference_missing", path: responsiveGraphArtifact.path, message: String(edge.logical_element_id) });
        if (!edge.from_viewport || !viewportNames.has(edge.from_viewport) || !edge.to_viewport || !viewportNames.has(edge.to_viewport))
          issues.push({ code: "responsive_graph_viewport_missing", path: responsiveGraphArtifact.path, message: `${edge.from_viewport}:${edge.to_viewport}` });
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const visualLanguageArtifact = manifest.run_artifacts.visual_language;
  if (visualLanguageArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, visualLanguageArtifact.path), "utf8")) as {
        visual_language_version?: string;
        viewports?: Array<{ viewport_capture_id?: string }>;
        hypotheses?: Array<{ hypothesis_id?: string; viewport_capture_id?: string; layer?: string; confidence?: number; method?: string }>;
      };
      if (document.visual_language_version !== "0.1.0")
        issues.push({ code: "visual_language_version_unsupported", path: visualLanguageArtifact.path, message: String(document.visual_language_version) });
      const visualViewportIds = new Set((document.viewports ?? []).map((viewport) => viewport.viewport_capture_id).filter((id): id is string => Boolean(id)));
      for (const viewportId of visualViewportIds) if (!viewportIds.has(viewportId))
        issues.push({ code: "visual_language_viewport_missing", path: visualLanguageArtifact.path, message: viewportId });
      const hypothesisIds = new Set<string>();
      for (const hypothesis of document.hypotheses ?? []) {
        if (!hypothesis.hypothesis_id || hypothesisIds.has(hypothesis.hypothesis_id))
          issues.push({ code: "visual_hypothesis_duplicate", path: visualLanguageArtifact.path, message: String(hypothesis.hypothesis_id) });
        if (hypothesis.hypothesis_id) hypothesisIds.add(hypothesis.hypothesis_id);
        if (!hypothesis.viewport_capture_id || !visualViewportIds.has(hypothesis.viewport_capture_id))
          issues.push({ code: "visual_hypothesis_viewport_missing", path: visualLanguageArtifact.path, message: String(hypothesis.viewport_capture_id) });
        if (hypothesis.layer !== "L3" || hypothesis.confidence === undefined || hypothesis.confidence >= 1 || !hypothesis.method)
          issues.push({ code: "visual_hypothesis_contract_invalid", path: visualLanguageArtifact.path, message: String(hypothesis.hypothesis_id) });
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const analysisArtifact = manifest.run_artifacts.analysis;
  if (analysisArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, analysisArtifact.path), "utf8")) as {
        analysis_pipeline_version?: string;
        stages?: Array<{ stage_id?: string; kind?: string; status?: string; output_record_count?: number }>;
        findings?: Array<{ finding_id?: string; layer?: string; confidence?: number }>;
        semantic_inputs?: Array<{ source_id?: string; viewport_capture_id?: string; confidence?: number; layer?: string; method?: string }>;
      };
      if (document.analysis_pipeline_version !== "0.1.0") issues.push({ code: "analysis_pipeline_version_unsupported", path: analysisArtifact.path, message: String(document.analysis_pipeline_version) });
      const stageIds = new Set<string>();
      for (const stage of document.stages ?? []) {
        if (!stage.stage_id || stageIds.has(stage.stage_id)) issues.push({ code: "analysis_stage_duplicate", path: analysisArtifact.path, message: String(stage.stage_id) });
        if (stage.stage_id) stageIds.add(stage.stage_id);
        if (!Number.isInteger(stage.output_record_count) || (stage.output_record_count ?? -1) < 0) issues.push({ code: "analysis_stage_count_invalid", path: analysisArtifact.path, message: String(stage.stage_id) });
      }
      const findingIds = new Set<string>();
      for (const finding of document.findings ?? []) {
        if (!finding.finding_id || findingIds.has(finding.finding_id)) issues.push({ code: "analysis_finding_duplicate", path: analysisArtifact.path, message: String(finding.finding_id) });
        if (finding.finding_id) findingIds.add(finding.finding_id);
        if (finding.layer !== "L2" || finding.confidence !== 1) issues.push({ code: "analysis_finding_contract_invalid", path: analysisArtifact.path, message: String(finding.finding_id) });
      }
      for (const semantic of document.semantic_inputs ?? []) {
        if (!semantic.viewport_capture_id || !viewportIds.has(semantic.viewport_capture_id)) issues.push({ code: "analysis_semantic_viewport_missing", path: analysisArtifact.path, message: String(semantic.source_id) });
        if (semantic.layer !== "L3" || semantic.confidence === undefined || semantic.confidence >= 1 || !semantic.method) issues.push({ code: "analysis_semantic_contract_invalid", path: analysisArtifact.path, message: String(semantic.source_id) });
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  const ontologyArtifact = manifest.run_artifacts.ontology;
  if (ontologyArtifact) {
    try {
      const document = JSON.parse(await readFile(resolve(packageRoot, ontologyArtifact.path), "utf8")) as {
        ontology_version?: string;
        viewports?: Array<{
          viewport_capture_id?: string;
          page_entity_id?: string;
          entities?: Array<{
            ontology_entity_id?: string; taxonomy_id?: string; source_node_id?: string | null;
            logical_element_id?: string; parent_entity_id?: string | null; confidence?: number; layer?: string; method?: string;
          }>;
          relationships?: Array<{ relationship_id?: string; from_entity_id?: string; to_entity_id?: string }>;
        }>;
      };
      if (document.ontology_version !== ONTOLOGY_VERSION)
        issues.push({ code: "ontology_version_unsupported", path: ontologyArtifact.path, message: String(document.ontology_version) });
      const allEntityIds = new Set<string>();
      const allRelationshipIds = new Set<string>();
      for (const viewport of document.viewports ?? []) {
        const viewportId = viewport.viewport_capture_id;
        const entities = viewport.entities ?? [];
        const localIds = new Set<string>();
        for (const entity of entities) {
          if (!entity.ontology_entity_id) continue;
          if (allEntityIds.has(entity.ontology_entity_id))
            issues.push({ code: "duplicate_ontology_entity_id", path: ontologyArtifact.path, message: entity.ontology_entity_id });
          allEntityIds.add(entity.ontology_entity_id);
          localIds.add(entity.ontology_entity_id);
          if (!entity.taxonomy_id || !isTaxonomyId(entity.taxonomy_id))
            issues.push({ code: "ontology_taxonomy_term_unknown", path: ontologyArtifact.path, message: String(entity.taxonomy_id) });
          if (entity.source_node_id) {
            const nodeIds = viewportId ? nodeIdsByViewport.get(viewportId) : undefined;
            if (!nodeIds?.has(entity.source_node_id))
              issues.push({ code: "ontology_source_node_missing", path: ontologyArtifact.path, message: `${viewportId}:${entity.source_node_id}` });
          }
          if (entity.logical_element_id && !logicalIds.has(entity.logical_element_id))
            issues.push({ code: "ontology_logical_element_missing", path: ontologyArtifact.path, message: entity.logical_element_id });
          if (entity.layer === "L3" && (entity.confidence === undefined || entity.confidence >= 1 || !entity.method))
            issues.push({ code: "ontology_l3_contract_invalid", path: ontologyArtifact.path, message: entity.ontology_entity_id });
        }
        if (!viewportId || !viewportIds.has(viewportId))
          issues.push({ code: "ontology_viewport_missing", path: ontologyArtifact.path, message: String(viewportId) });
        const pageEntity = entities.find((entity) => entity.ontology_entity_id === viewport.page_entity_id);
        if (!pageEntity || pageEntity.parent_entity_id !== null)
          issues.push({ code: "ontology_page_root_invalid", path: ontologyArtifact.path, message: String(viewport.page_entity_id) });
        for (const entity of entities) {
          if (entity.parent_entity_id && !localIds.has(entity.parent_entity_id))
            issues.push({ code: "ontology_parent_missing", path: ontologyArtifact.path, message: `${entity.ontology_entity_id}:${entity.parent_entity_id}` });
        }
        for (const relationship of viewport.relationships ?? []) {
          if (relationship.relationship_id) {
            if (allRelationshipIds.has(relationship.relationship_id))
              issues.push({ code: "duplicate_ontology_relationship_id", path: ontologyArtifact.path, message: relationship.relationship_id });
            allRelationshipIds.add(relationship.relationship_id);
          }
          if (!relationship.from_entity_id || !localIds.has(relationship.from_entity_id) ||
            !relationship.to_entity_id || !localIds.has(relationship.to_entity_id))
            issues.push({ code: "ontology_relationship_endpoint_missing", path: ontologyArtifact.path, message: String(relationship.relationship_id) });
        }
      }
    } catch { /* serialization issues are reported by the artifact pass */ }
  }
  return issues;
}

function validateJsonContent(path: string, mediaType: string, content: Buffer): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  try {
    if (mediaType === "application/json") JSON.parse(content.toString("utf8"));
    if (mediaType === "application/x-ndjson") {
      content.toString("utf8").split(/\r?\n/).filter(Boolean).forEach((line) => JSON.parse(line));
    }
  } catch (error) {
    issues.push({ code: "invalid_serialized_content", path, message: error instanceof Error ? error.message : String(error) });
  }
  return issues;
}

export async function verifyCapturePackage(packageRootInput: string): Promise<VerificationReport> {
  const packageRoot = resolve(packageRootInput);
  const issues: VerificationIssue[] = [];
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8"));
  } catch (error) {
    return {
      valid: false, package_root: packageRoot, checked_artifacts: 0,
      issues: [{ code: "manifest_unreadable", path: "manifest.json", message: error instanceof Error ? error.message : String(error) }]
    };
  }
  if (!hasManifestStructure(parsedManifest)) {
    return { valid: false, package_root: packageRoot, checked_artifacts: 0,
      issues: [{ code: "manifest_invalid_structure", path: "manifest.json", message: "Required manifest collections or identifiers are missing" }] };
  }
  const manifest = parsedManifest;
  if (manifest.schema_version !== "0.1.0") {
    issues.push({ code: "unsupported_schema_version", path: "manifest.json", message: `Expected 0.1.0, got ${String(manifest.schema_version)}` });
  }
  if (!manifest.capture_run_id?.startsWith("cap_")) {
    issues.push({ code: "invalid_capture_run_id", path: "manifest.json", message: "capture_run_id is missing or invalid" });
  }

  const artifactEntries = collectArtifacts(manifest);
  const seenPaths = new Set<string>();
  let checkedArtifacts = 0;
  for (const { key, artifact } of artifactEntries) {
    if (!artifact?.path || !artifact.sha256 || !Number.isInteger(artifact.bytes)) {
      issues.push({ code: "invalid_artifact_reference", message: `${key} is incomplete` });
      continue;
    }
    const absolutePath = resolve(packageRoot, artifact.path);
    if (!isInsideRoot(packageRoot, absolutePath)) {
      issues.push({ code: "artifact_path_escape", path: artifact.path, message: `${key} resolves outside the package` });
      continue;
    }
    if (seenPaths.has(artifact.path)) {
      issues.push({ code: "duplicate_artifact_path", path: artifact.path, message: `${key} repeats an existing artifact path` });
      continue;
    }
    seenPaths.add(artifact.path);
    try {
      const fileInfo = await stat(absolutePath);
      if (!fileInfo.isFile()) throw new Error("Artifact is not a regular file");
      const content = await readFile(absolutePath);
      checkedArtifacts++;
      if (content.byteLength !== artifact.bytes) {
        issues.push({ code: "artifact_size_mismatch", path: artifact.path, message: `Expected ${artifact.bytes} bytes, got ${content.byteLength}` });
      }
      const actualHash = sha256(content);
      if (actualHash !== artifact.sha256) {
        issues.push({ code: "artifact_hash_mismatch", path: artifact.path, message: `Expected ${artifact.sha256}, got ${actualHash}` });
      }
      issues.push(...validateJsonContent(artifact.path, artifact.media_type, content));
    } catch (error) {
      issues.push({ code: "artifact_unreadable", path: artifact.path, message: error instanceof Error ? error.message : String(error) });
    }
  }
  issues.push(...await verifyRelations(packageRoot, manifest));
  return {
    valid: issues.length === 0,
    package_root: packageRoot,
    capture_run_id: manifest.capture_run_id,
    checked_artifacts: checkedArtifacts,
    issues
  };
}
