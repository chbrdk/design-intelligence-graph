import { sha256 } from "./io.js";
import type { LogicalElement, MatchableNode } from "./matching.js";
import type { MeasuredBox, MeasuredStyle } from "./responsive.js";
import { ONTOLOGY_VERSION, TAXONOMY, getTaxonomyTerm, type OntologyEntityType, type TaxonomyId } from "./taxonomy.js";
import type { SectionComposition } from "./section-composition.js";

export interface OntologyEvidence {
  kind: "dom" | "geometry" | "style" | "relationship";
  fact: string;
  value: unknown;
}

export interface OntologyEntity {
  ontology_entity_id: string;
  entity_type: OntologyEntityType;
  taxonomy_id: TaxonomyId;
  label: string;
  viewport_capture_id: string;
  source_node_id: string | null;
  logical_element_id?: string;
  parent_entity_id: string | null;
  confidence: number;
  method: string;
  layer: "L2" | "L3";
  evidence: OntologyEvidence[];
  attributes: Record<string, unknown>;
}

export interface ViewportOntology {
  ontology_version: string;
  viewport_capture_id: string;
  viewport_name: string;
  page_entity_id: string;
  entities: OntologyEntity[];
  relationships: Array<{
    relationship_id: string;
    type: "contains" | "implements" | "labels";
    from_entity_id: string;
    to_entity_id: string;
    confidence: number;
    layer: "L2" | "L3";
  }>;
}

const id = (prefix: string, value: string): string => `${prefix}_${sha256(value).slice(7, 27)}`;

function descendants(nodeId: string, children: Map<string | null, MatchableNode[]>): MatchableNode[] {
  const result: MatchableNode[] = [];
  const queue = [...(children.get(nodeId) ?? [])];
  while (queue.length) {
    const current = queue.shift()!;
    result.push(current);
    queue.push(...(children.get(current.node_id) ?? []));
  }
  return result;
}

export function deriveViewportOntology(input: {
  viewport_capture_id: string;
  viewport_name: string;
  viewport_height: number;
  title: string;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
  styles: MeasuredStyle[];
}): ViewportOntology {
  const nodesById = new Map(input.nodes.map((node) => [node.node_id, node]));
  const boxes = new Map(input.boxes.map((box) => [box.node_id, box.bbox]));
  const styles = new Map(input.styles.map((style) => [style.node_id, style.properties ?? {}]));
  const children = new Map<string | null, MatchableNode[]>();
  for (const node of input.nodes) children.set(node.parent_node_id ?? null, [...(children.get(node.parent_node_id ?? null) ?? []), node]);
  const entities: OntologyEntity[] = [];
  const entityIdsByNode = new Map<string, string[]>();
  const add = (node: MatchableNode | null, taxonomyId: TaxonomyId, confidence: number, method: string, layer: "L2" | "L3", evidence: OntologyEvidence[], attributes: Record<string, unknown> = {}) => {
    const term = getTaxonomyTerm(taxonomyId) ?? TAXONOMY[taxonomyId];
    if (!term) throw new Error(`Unknown taxonomy id: ${taxonomyId}`);
    const entityId = id("ont", `${input.viewport_capture_id}|${node?.node_id ?? "page"}|${taxonomyId}`);
    const existing = entities.find((candidate) => candidate.ontology_entity_id === entityId);
    if (existing) return existing;
    const entity: OntologyEntity = {
      ontology_entity_id: entityId,
      entity_type: term.entity_type,
      taxonomy_id: taxonomyId,
      label: term.label,
      viewport_capture_id: input.viewport_capture_id,
      source_node_id: node?.node_id ?? null,
      parent_entity_id: null,
      confidence,
      method,
      layer,
      evidence,
      attributes
    };
    entities.push(entity);
    if (node) entityIdsByNode.set(node.node_id, [...(entityIdsByNode.get(node.node_id) ?? []), entityId]);
    return entity;
  };

  const page = add(null, "dig:page.unknown", 1, "page_root", "L2", [{ kind: "dom", fact: "document_title", value: input.title }]);
  const heroNodeIds = new Set<string>();
  for (const node of input.nodes) {
    if (node.node_type === "pseudo" && node.rendered) {
      add(node, "dig:element.decorative", 0.9, "pseudo_element", "L2", [
        { kind: "dom", fact: "pseudo_type", value: node.pseudo_type ?? "pseudo" }
      ]);
      continue;
    }
    if (node.node_type !== "element" || !node.tag || !node.rendered) continue;
    const tag = node.tag;
    const role = node.attributes?.role;
    const domEvidence: OntologyEvidence[] = [{ kind: "dom", fact: "tag", value: tag }];
    if (tag === "header" || role === "banner") add(node, "dig:region.banner", 0.99, "html_landmark", "L2", domEvidence);
    if (tag === "nav" || role === "navigation") {
      add(node, "dig:region.navigation", 0.99, "html_landmark", "L2", domEvidence);
      add(node, "dig:component.navigation", 0.98, "navigation_semantics", "L2", domEvidence);
      add(node, "dig:pattern.navigation", 0.98, "navigation_semantics", "L2", domEvidence);
    }
    if (tag === "main" || role === "main") add(node, "dig:region.main", 0.99, "html_landmark", "L2", domEvidence);
    if (tag === "aside" || role === "complementary") add(node, "dig:region.complementary", 0.99, "html_landmark", "L2", domEvidence);
    if (tag === "footer" || role === "contentinfo") add(node, "dig:region.contentinfo", 0.99, "html_landmark", "L2", domEvidence);
    if (tag === "section") {
      add(node, "dig:section.generic", 0.98, "section_element", "L2", domEvidence);
      const nodeDescendants = descendants(node.node_id, children);
      const hasH1 = nodeDescendants.some((candidate) => candidate.tag === "h1");
      const bbox = boxes.get(node.node_id);
      if (hasH1 && bbox && bbox.y < input.viewport_height * 1.2) {
        add(node, "dig:pattern.hero", 0.86, "top_section_with_h1", "L3", [
          ...domEvidence,
          { kind: "relationship", fact: "contains_h1", value: true },
          { kind: "geometry", fact: "document_y", value: bbox.y }
        ]);
        heroNodeIds.add(node.node_id);
      }
    }
    if (tag === "article") add(node, "dig:section.article", 0.99, "article_element", "L2", domEvidence);
    if (tag === "form") {
      add(node, "dig:component.form", 0.99, "form_element", "L2", domEvidence);
      add(node, "dig:pattern.form", 0.97, "form_semantics", "L2", domEvidence);
      if (role === "search" || node.attributes?.["aria-label"]?.toLowerCase().includes("search")) {
        add(node, "dig:component.search", 0.96, "search_form_semantics", "L2", domEvidence);
        add(node, "dig:pattern.search", 0.96, "search_form_semantics", "L2", domEvidence);
      }
    }
    if (["input", "select", "textarea"].includes(tag)) add(node, "dig:component.form_control", 0.99, "form_control_element", "L2", domEvidence,
      { control_type: node.attributes?.type ?? tag });
    if (tag === "button" || role === "button") add(node, "dig:component.button", 0.99, "button_semantics", "L2", domEvidence);
    if (tag === "a" || role === "link") add(node, "dig:component.link", 0.99, "link_semantics", "L2", domEvidence);
    if (["img", "svg", "video", "canvas"].includes(tag)) add(node, "dig:component.media", 0.98, "media_element", "L2", domEvidence);
    if (tag === "iframe") {
      add(node, "dig:component.embed", 0.99, "iframe_element", "L2", domEvidence);
      add(node, "dig:pattern.embedded_content", 0.98, "iframe_element", "L2", domEvidence);
    }
    if (tag === "ul" || tag === "ol" || role === "list") add(node, "dig:component.list", 0.98, "list_semantics", "L2", domEvidence);
    if (tag === "li" || role === "listitem") add(node, "dig:component.list_item", 0.98, "list_item_semantics", "L2", domEvidence);
    if (tag === "table" || role === "table" || role === "grid") add(node, "dig:component.table", 0.98, "table_semantics", "L2", domEvidence);
    if (tag === "dialog" || role === "dialog" || role === "alertdialog") {
      add(node, "dig:component.dialog", 0.99, "dialog_semantics", "L2", domEvidence);
      add(node, "dig:pattern.modal", 0.9, "dialog_semantics", "L3", domEvidence);
    }
    if (tag === "details") add(node, "dig:component.disclosure", 0.99, "details_element", "L2", domEvidence);
    if (role === "tablist") {
      add(node, "dig:component.tabs", 0.99, "aria_tablist", "L2", domEvidence);
      add(node, "dig:pattern.tabs", 0.99, "aria_tablist", "L2", domEvidence);
    }
    if (tag === "figure") add(node, "dig:component.figure", 0.99, "figure_element", "L2", domEvidence);
    if (/^h[1-6]$/.test(tag)) add(node, "dig:content.heading", 0.99, "heading_element", "L2", domEvidence, { level: Number(tag[1]) });
    if (tag === "p") add(node, "dig:content.body_text", 0.96, "paragraph_element", "L2", domEvidence);
    if (tag === "label") add(node, "dig:content.label", 0.99, "label_element", "L2", domEvidence);
    if (tag === "figcaption" || tag === "caption") add(node, "dig:content.caption", 0.99, "caption_element", "L2", domEvidence);
    if (tag === "blockquote" || tag === "q") add(node, "dig:content.quote", 0.99, "quote_element", "L2", domEvidence);
    if (tag === "code" || tag === "pre") add(node, "dig:content.code", 0.98, "code_element", "L2", domEvidence);
    if ((tag === "nav" || role === "navigation") && node.attributes?.["aria-label"]?.toLowerCase().includes("breadcrumb"))
      add(node, "dig:pattern.breadcrumb", 0.98, "breadcrumb_aria_label", "L2", domEvidence);
    const position = styles.get(node.node_id)?.position;
    if (tag === "header" && position === "sticky") add(node, "dig:pattern.sticky_header", 0.97, "sticky_header_geometry", "L2", [
      ...domEvidence, { kind: "style", fact: "position", value: position }
    ]);
  }

  for (const node of input.nodes.filter((candidate) => candidate.node_type === "element" && candidate.rendered)) {
    const nodeDescendants = descendants(node.node_id, children);
    const detailCount = nodeDescendants.filter((candidate) => candidate.tag === "details").length;
    if ((node.tag === "section" || node.tag === "div") && detailCount >= 2)
      add(node, "dig:pattern.accordion", 0.88, "repeated_disclosure_group", "L3", [
        { kind: "relationship", fact: "details_count", value: detailCount }
      ]);
    const display = styles.get(node.node_id)?.display ?? "";
    const cardCandidates = nodeDescendants.filter((candidate) => candidate.tag === "article" || candidate.tag === "li").length;
    if ((display.includes("grid") || display.includes("flex")) && cardCandidates >= 3)
      add(node, "dig:pattern.card_grid", 0.8, "repeated_items_in_layout_context", "L3", [
        { kind: "style", fact: "display", value: display },
        { kind: "relationship", fact: "repeated_item_count", value: cardCandidates }
      ]);
  }

  for (const heroNodeId of heroNodeIds) {
    for (const candidate of descendants(heroNodeId, children).filter((node) => node.tag === "a" || node.tag === "button")) {
      add(candidate, "dig:pattern.primary_action", 0.78, "interactive_element_in_hero", "L3", [
        { kind: "relationship", fact: "inside_hero", value: heroNodeId }
      ]);
    }
  }

  const hasHero = entities.some((entity) => entity.taxonomy_id === "dig:pattern.hero");
  const hasForm = entities.some((entity) => entity.taxonomy_id === "dig:component.form");
  page.taxonomy_id = hasHero && hasForm ? "dig:page.landing" : "dig:page.content";
  page.label = getTaxonomyTerm(page.taxonomy_id)?.label ?? TAXONOMY[page.taxonomy_id]?.label ?? page.taxonomy_id;
  page.confidence = hasHero && hasForm ? 0.82 : 0.72;
  page.method = hasHero && hasForm ? "hero_and_form_page_heuristic" : "content_structure_heuristic";
  page.layer = "L3";

  for (const entity of entities) {
    if (!entity.source_node_id) continue;
    let ancestorId = nodesById.get(entity.source_node_id)?.parent_node_id ?? null;
    while (ancestorId) {
      const parentEntity = (entityIdsByNode.get(ancestorId) ?? []).map((entityId) => entities.find((candidate) => candidate.ontology_entity_id === entityId))
        .find((candidate) => candidate && ["region", "section", "component"].includes(candidate.entity_type));
      if (parentEntity) { entity.parent_entity_id = parentEntity.ontology_entity_id; break; }
      ancestorId = nodesById.get(ancestorId)?.parent_node_id ?? null;
    }
    if (!entity.parent_entity_id) entity.parent_entity_id = page.ontology_entity_id;
  }
  const relationships: ViewportOntology["relationships"] = [];
  const relationshipIds = new Set<string>();
  const pushRelationship = (rel: ViewportOntology["relationships"][number]) => {
    if (relationshipIds.has(rel.relationship_id)) return;
    relationshipIds.add(rel.relationship_id);
    relationships.push(rel);
  };
  for (const entity of entities.filter((item) => item.parent_entity_id)) {
    pushRelationship({
      relationship_id: id("rel", `${entity.parent_entity_id}|contains|${entity.ontology_entity_id}`),
      type: "contains",
      from_entity_id: entity.parent_entity_id!,
      to_entity_id: entity.ontology_entity_id,
      confidence: Math.min(1, entity.confidence),
      layer: entity.layer
    });
  }
  for (const [nodeId, entityIds] of entityIdsByNode.entries()) {
    const nodeEntities = entityIds.map((entityId) => entities.find((entity) => entity.ontology_entity_id === entityId)!).filter(Boolean);
    for (const component of nodeEntities.filter((entity) => entity.entity_type === "component")) {
      for (const pattern of nodeEntities.filter((entity) => entity.entity_type === "ux_pattern")) {
        pushRelationship({
          relationship_id: id("rel", `${component.ontology_entity_id}|implements|${pattern.ontology_entity_id}`),
          type: "implements",
          from_entity_id: component.ontology_entity_id,
          to_entity_id: pattern.ontology_entity_id,
          confidence: Math.min(component.confidence, pattern.confidence),
          layer: pattern.layer
        });
      }
    }
    const node = nodesById.get(nodeId);
    if (node?.tag === "label") {
      const targetHtmlId = node.attributes?.for;
      const targetNode = targetHtmlId
        ? input.nodes.find((candidate) => candidate.attributes?.id === targetHtmlId)
        : descendants(node.node_id, children).find((candidate) => ["input", "select", "textarea"].includes(candidate.tag ?? ""));
      const labelEntity = nodeEntities.find((entity) => entity.taxonomy_id === "dig:content.label");
      const targetEntity = targetNode ? (entityIdsByNode.get(targetNode.node_id) ?? []).map((entityId) => entities.find((entity) => entity.ontology_entity_id === entityId))
        .find((entity) => entity?.taxonomy_id === "dig:component.form_control") : undefined;
      if (labelEntity && targetEntity) {
        pushRelationship({
          relationship_id: id("rel", `${labelEntity.ontology_entity_id}|labels|${targetEntity.ontology_entity_id}`),
          type: "labels",
          from_entity_id: labelEntity.ontology_entity_id,
          to_entity_id: targetEntity.ontology_entity_id,
          confidence: 1,
          layer: "L2"
        });
      }
    }
  }
  return { ontology_version: ONTOLOGY_VERSION, viewport_capture_id: input.viewport_capture_id, viewport_name: input.viewport_name,
    page_entity_id: page.ontology_entity_id, entities, relationships };
}

export function attachLogicalElements(viewports: ViewportOntology[], logicalElements: LogicalElement[]): ViewportOntology[] {
  const logicalByMember = new Map<string, string>();
  for (const logical of logicalElements) for (const member of logical.members)
    logicalByMember.set(`${member.viewport_capture_id}:${member.node_id}`, logical.logical_element_id);
  return viewports.map((viewport) => ({
    ...viewport,
    entities: viewport.entities.map((entity) => {
      if (!entity.source_node_id) return entity;
      const logicalId = logicalByMember.get(`${viewport.viewport_capture_id}:${entity.source_node_id}`);
      return logicalId ? { ...entity, logical_element_id: logicalId } : entity;
    })
  }));
}

/** Attach classified section compositions as ontology entities on matching roots. */
export function enrichOntologyWithSectionCompositions(
  viewports: ViewportOntology[],
  sections: SectionComposition[]
): ViewportOntology[] {
  const byViewport = new Map<string, SectionComposition[]>();
  for (const section of sections) {
    byViewport.set(section.viewport_capture_id, [...(byViewport.get(section.viewport_capture_id) ?? []), section]);
  }

  return viewports.map((viewport) => {
    const page = viewport.entities.find((entity) => entity.ontology_entity_id === viewport.page_entity_id);
    const additions: OntologyEntity[] = [];
    const relationships = [...viewport.relationships];
    for (const section of byViewport.get(viewport.viewport_capture_id) ?? []) {
      const term = getTaxonomyTerm(section.taxonomy_id);
      if (!term) continue;
      const already = viewport.entities.some(
        (entity) => entity.source_node_id === section.root_node_id && entity.taxonomy_id === section.taxonomy_id
      );
      if (already) continue;
      const entityId = id("ont", `${viewport.viewport_capture_id}|${section.root_node_id}|${section.taxonomy_id}|composition`);
      if (viewport.entities.some((entity) => entity.ontology_entity_id === entityId)) continue;
      const entity: OntologyEntity = {
        ontology_entity_id: entityId,
        entity_type: term.entity_type,
        taxonomy_id: section.taxonomy_id,
        label: term.label,
        viewport_capture_id: viewport.viewport_capture_id,
        source_node_id: section.root_node_id,
        parent_entity_id: page?.ontology_entity_id ?? null,
        confidence: section.confidence,
        method: `section_composition:${section.method}`,
        layer: section.layer,
        evidence: [
          { kind: "relationship", fact: "signature", value: section.signature },
          { kind: "relationship", fact: "category", value: section.category }
        ],
        attributes: {
          signature: section.signature,
          category: section.category,
          text_signals: section.text_signals.slice(0, 4)
        }
      };
      additions.push(entity);
      if (page) {
        relationships.push({
          relationship_id: id("rel", `${page.ontology_entity_id}|contains|${entityId}`),
          type: "contains",
          from_entity_id: page.ontology_entity_id,
          to_entity_id: entityId,
          confidence: section.confidence,
          layer: section.layer
        });
      }
    }
    return {
      ...viewport,
      entities: [...viewport.entities, ...additions],
      relationships
    };
  });
}

/** Drop duplicate viewport rows and re-key colliding entity/relationship ids across viewports. */
export function uniquifyOntologyViewports(viewports: ViewportOntology[]): ViewportOntology[] {
  const seenViewport = new Set<string>();
  const usedEntity = new Set<string>();
  const usedRel = new Set<string>();
  const unique: ViewportOntology[] = [];
  for (const viewport of viewports) {
    if (seenViewport.has(viewport.viewport_capture_id)) continue;
    seenViewport.add(viewport.viewport_capture_id);
    const remap = new Map<string, string>();
    for (const entity of viewport.entities) {
      let nextId = entity.ontology_entity_id;
      if (usedEntity.has(nextId)) {
        nextId = id("ont", `${viewport.viewport_capture_id}|${entity.ontology_entity_id}|rekey`);
      }
      usedEntity.add(nextId);
      remap.set(entity.ontology_entity_id, nextId);
    }
    const entities = viewport.entities.map((entity) => ({
      ...entity,
      ontology_entity_id: remap.get(entity.ontology_entity_id) ?? entity.ontology_entity_id,
      parent_entity_id: entity.parent_entity_id
        ? (remap.get(entity.parent_entity_id) ?? entity.parent_entity_id)
        : null
    }));
    const relationships = viewport.relationships.map((rel) => {
      let relationshipId = rel.relationship_id;
      if (usedRel.has(relationshipId)) {
        relationshipId = id("rel", `${viewport.viewport_capture_id}|${rel.relationship_id}|rekey`);
      }
      usedRel.add(relationshipId);
      return {
        ...rel,
        relationship_id: relationshipId,
        from_entity_id: remap.get(rel.from_entity_id) ?? rel.from_entity_id,
        to_entity_id: remap.get(rel.to_entity_id) ?? rel.to_entity_id
      };
    });
    unique.push({
      ...viewport,
      page_entity_id: remap.get(viewport.page_entity_id) ?? viewport.page_entity_id,
      entities,
      relationships
    });
  }
  return unique;
}
