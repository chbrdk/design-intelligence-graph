import { sha256 } from "./io.js";
import type { MatchableNode } from "./matching.js";
import type { MeasuredBox, MeasuredStyle } from "./responsive.js";
import { getCatalogEntries, getTaxonomyTerm, type CatalogEntry } from "./taxonomy.js";

export const SECTION_COMPOSITION_VERSION = "0.1.0";

export type BlockRole =
  | "media_large"
  | "media"
  | "heading"
  | "subheading"
  | "body"
  | "cta"
  | "cta_pair"
  | "list"
  | "form"
  | "nav"
  | "decorative"
  | "unknown";

export interface RoleStep {
  kind: "role";
  role: BlockRole;
  node_id: string;
  text_preview?: string;
  box: { x: number; y: number; width: number; height: number };
}

export interface GapStep {
  kind: "gap";
  gap_px: number;
}

export type RecipeStep = RoleStep | GapStep;

export interface SectionComposition {
  section_id: string;
  viewport_capture_id: string;
  viewport_name: string;
  root_node_id: string;
  taxonomy_id: string;
  category: string;
  confidence: number;
  method: string;
  recipe: RecipeStep[];
  signature: string;
  text_signals: string[];
  layer: "L2" | "L3";
}

export interface SectionCompositionCluster {
  signature: string;
  category: string;
  taxonomy_id: string;
  count: number;
  viewport_names: string[];
  example_text_signals: string[];
}

export interface SectionCompositionDocument {
  schema_version: "0.1.0";
  section_composition_version: typeof SECTION_COMPOSITION_VERSION;
  generated_at: string;
  viewports: Array<{
    viewport_capture_id: string;
    viewport_name: string;
    sections: SectionComposition[];
  }>;
  clusters: SectionCompositionCluster[];
}

type BBox = { x: number; y: number; width: number; height: number };

const MAX_SECTIONS_PER_VIEWPORT = 24;
const MAX_STACK_ITEMS = 12;
const MEDIA_LARGE_MIN_HEIGHT = 180;
const MEDIA_LARGE_MIN_WIDTH = 240;

function id(prefix: string, value: string): string {
  return `${prefix}_${sha256(value).slice(7, 27)}`;
}

function boxMap(boxes: MeasuredBox[]): Map<string, BBox> {
  return new Map(boxes.flatMap((box) => (box.bbox ? [[box.node_id, box.bbox] as const] : [])));
}

function styleMap(styles: MeasuredStyle[]): Map<string, Record<string, string>> {
  return new Map(styles.map((style) => [style.node_id, style.properties ?? {}]));
}

function childrenMap(nodes: MatchableNode[]): Map<string | null, MatchableNode[]> {
  const children = new Map<string | null, MatchableNode[]>();
  for (const node of nodes) {
    const parent = node.parent_node_id ?? null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  return children;
}

function previewText(node: MatchableNode): string | undefined {
  const text = (node.text ?? node.attributes?.["aria-label"] ?? "").replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.slice(0, 80);
}

function isRenderedElement(node: MatchableNode): boolean {
  return node.node_type === "element" && Boolean(node.tag) && Boolean(node.rendered);
}

function area(box: BBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function detectSectionRoots(
  nodes: MatchableNode[],
  boxes: Map<string, BBox>,
  viewportHeight: number
): MatchableNode[] {
  const tagged = nodes.filter((node) => {
    if (!isRenderedElement(node) || !node.tag) return false;
    const tag = node.tag;
    if (tag === "section" || tag === "article") return true;
    if (tag === "header" || tag === "footer" || tag === "main" || tag === "aside") return true;
    return false;
  });

  const largeBlocks = nodes.filter((node) => {
    if (!isRenderedElement(node) || !node.tag) return false;
    if (!["div", "section", "article", "main"].includes(node.tag)) return false;
    const box = boxes.get(node.node_id);
    if (!box) return false;
    const tallEnough = box.height >= Math.min(220, viewportHeight * 0.28);
    const wideEnough = box.width >= 280;
    return tallEnough && wideEnough;
  });

  const candidates = [...tagged, ...largeBlocks];
  const unique = new Map<string, MatchableNode>();
  for (const node of candidates) unique.set(node.node_id, node);

  const ranked = [...unique.values()]
    .map((node) => ({ node, box: boxes.get(node.node_id) }))
    .filter((item): item is { node: MatchableNode; box: BBox } => Boolean(item.box))
    // Prefer semantic section/article bands over giant main wrappers at the same fold.
    .sort((a, b) => {
      const tagScore = (tag: string | undefined) =>
        tag === "section" || tag === "article" ? 2 : tag === "header" || tag === "footer" ? 1 : 0;
      const y = a.box.y - b.box.y;
      if (y !== 0) return y;
      const semantic = tagScore(b.node.tag) - tagScore(a.node.tag);
      if (semantic !== 0) return semantic;
      return b.box.height - a.box.height;
    });

  const selected: MatchableNode[] = [];
  for (const { node, box } of ranked) {
    const nestedInsideSelected = selected.some((other) => {
      const otherBox = boxes.get(other.node_id);
      if (!otherBox) return false;
      const contained =
        box.y >= otherBox.y - 2 &&
        box.y + box.height <= otherBox.y + otherBox.height + 2 &&
        box.x >= otherBox.x - 2 &&
        box.x + box.width <= otherBox.x + otherBox.width + 2 &&
        area(box) < area(otherBox) * 0.92;
      return contained;
    });
    if (nestedInsideSelected) continue;
    selected.push(node);
    if (selected.length >= MAX_SECTIONS_PER_VIEWPORT) break;
  }
  return selected;
}

function isMediaTag(tag: string | undefined): boolean {
  const value = (tag ?? "").toLowerCase();
  return value === "img" || value === "picture" || value === "video" || value === "canvas" || value === "svg" || value === "iframe" || value === "figure";
}

function collectDirectChildren(
  rootId: string,
  children: Map<string | null, MatchableNode[]>,
  boxes: Map<string, BBox>
): MatchableNode[] {
  const direct = (children.get(rootId) ?? []).filter(isRenderedElement);
  const withBoxes = direct.filter((node) => boxes.has(node.node_id));
  if (withBoxes.length >= 2) return withBoxes;

  // Flatten one level when the section is a thin wrapper (multi-child or single media band).
  const flattened: MatchableNode[] = [];
  for (const child of withBoxes.length ? withBoxes : direct) {
    const grand = (children.get(child.node_id) ?? []).filter((node) => isRenderedElement(node) && boxes.has(node.node_id));
    if (grand.length >= 2) {
      flattened.push(...grand);
      continue;
    }
    const sole = grand[0];
    if (sole && isMediaTag(sole.tag)) {
      flattened.push(sole);
      continue;
    }
    if (boxes.has(child.node_id)) flattened.push(child);
  }
  return flattened.length ? flattened : withBoxes;
}

function assignRole(node: MatchableNode, box: BBox, styles: Map<string, Record<string, string>>): BlockRole {
  const tag = (node.tag ?? "").toLowerCase();
  const role = node.attributes?.role;
  const props = styles.get(node.node_id) ?? {};

  if (tag === "nav" || role === "navigation") return "nav";
  if (tag === "form" || role === "form") return "form";
  if (tag === "ul" || tag === "ol" || tag === "dl") return "list";
  if (tag === "img" || tag === "picture" || tag === "video" || tag === "canvas" || tag === "svg" || tag === "iframe") {
    return box.height >= MEDIA_LARGE_MIN_HEIGHT && box.width >= MEDIA_LARGE_MIN_WIDTH ? "media_large" : "media";
  }
  if (tag === "figure") {
    return box.height >= MEDIA_LARGE_MIN_HEIGHT ? "media_large" : "media";
  }
  if (/^h[1-3]$/.test(tag)) return "heading";
  if (/^h[4-6]$/.test(tag)) return "subheading";
  if (tag === "p" || tag === "span" || tag === "figcaption") {
    const text = previewText(node) ?? "";
    return text.length > 90 ? "body" : text.length > 0 ? "body" : "unknown";
  }
  if (tag === "button" || role === "button") return "cta";
  if (tag === "a") {
    const display = props.display ?? "";
    const looksButton = /inline-flex|flex|inline-block|block/.test(display) && box.height >= 28 && box.height <= 72;
    return looksButton ? "cta" : "cta";
  }
  if (node.node_type === "pseudo") return "decorative";

  const bg = props["background-image"] ?? "";
  if (bg && bg !== "none" && box.height >= MEDIA_LARGE_MIN_HEIGHT) return "media_large";

  if (["div", "section", "article", "header", "footer", "main", "aside"].includes(tag)) {
    if (box.height >= MEDIA_LARGE_MIN_HEIGHT && box.width >= MEDIA_LARGE_MIN_WIDTH) {
      const text = previewText(node) ?? "";
      if (!text && bg && bg !== "none") return "media_large";
    }
  }
  return "unknown";
}

function mergeCtaPair(steps: RoleStep[]): RoleStep[] {
  const merged: RoleStep[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const current = steps[index]!;
    const next = steps[index + 1];
    if (current.role === "cta" && next?.role === "cta") {
      const gap = Math.abs(next.box.y - (current.box.y + current.box.height));
      const horizontal = Math.abs(next.box.y - current.box.y) < Math.max(current.box.height, next.box.height) * 0.7;
      if (gap < 48 || horizontal) {
        merged.push({
          ...current,
          role: "cta_pair",
          text_preview: [current.text_preview, next.text_preview].filter(Boolean).join(" | ").slice(0, 100)
        });
        index += 1;
        continue;
      }
    }
    merged.push(current);
  }
  return merged;
}

function normalizeRoleForSignature(role: BlockRole): string {
  if (role === "media_large") return "media";
  if (role === "subheading") return "heading";
  if (role === "cta_pair") return "cta";
  return role;
}

function buildRecipe(
  root: MatchableNode,
  children: Map<string | null, MatchableNode[]>,
  boxes: Map<string, BBox>,
  styles: Map<string, Record<string, string>>
): { recipe: RecipeStep[]; signature: string; text_signals: string[] } {
  const stackNodes = collectDirectChildren(root.node_id, children, boxes)
    .map((node) => ({ node, box: boxes.get(node.node_id)! }))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .slice(0, MAX_STACK_ITEMS);

  let roles = stackNodes.map(({ node, box }) => {
    const role = assignRole(node, box, styles);
    const text = previewText(node);
    const step: RoleStep = {
      kind: "role",
      role,
      node_id: node.node_id,
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
      ...(text ? { text_preview: text } : {})
    };
    return step;
  });

  roles = mergeCtaPair(roles.filter((step) => step.role !== "unknown" || (step.text_preview?.length ?? 0) > 0));
  if (!roles.length) {
    const rootBox = boxes.get(root.node_id);
    if (rootBox) {
      const role = assignRole(root, rootBox, styles);
      const text = previewText(root);
      roles = [{
        kind: "role",
        role: role === "unknown" ? "body" : role,
        node_id: root.node_id,
        box: rootBox,
        ...(text ? { text_preview: text } : {})
      }];
    }
  }

  const recipe: RecipeStep[] = [];
  for (let index = 0; index < roles.length; index += 1) {
    const step = roles[index]!;
    recipe.push(step);
    const next = roles[index + 1];
    if (!next) continue;
    const gap = Math.max(0, Math.round(next.box.y - (step.box.y + step.box.height)));
    recipe.push({ kind: "gap", gap_px: gap });
  }

  const signature = roles
    .map((step) => normalizeRoleForSignature(step.role))
    .filter((role, index, all) => role !== "decorative" && role !== all[index - 1])
    .join(">");

  const text_signals = roles
    .flatMap((step) => (step.text_preview ? [step.text_preview] : []))
    .slice(0, 6);

  return { recipe, signature: signature || "unknown", text_signals };
}

function hintScore(signature: string, hint: string[]): number {
  const roles = signature.split(">").filter(Boolean);
  if (!hint.length || !roles.length) return 0;
  const normalizedHint = hint.map((role) => (role === "media_large" ? "media" : role === "cta_pair" ? "cta" : role));
  let matched = 0;
  let cursor = 0;
  for (const expected of normalizedHint) {
    const found = roles.indexOf(expected, cursor);
    if (found < 0) continue;
    matched += 1;
    cursor = found + 1;
  }
  const coverage = matched / normalizedHint.length;
  const orderBonus = matched === normalizedHint.length ? 0.15 : 0;
  return coverage + orderBonus;
}

function classifySection(input: {
  root: MatchableNode;
  box: BBox;
  signature: string;
  text_signals: string[];
  viewportHeight: number;
  styles: Map<string, Record<string, string>>;
  children: Map<string | null, MatchableNode[]>;
}): { taxonomy_id: string; category: string; confidence: number; method: string } {
  const tag = (input.root.tag ?? "").toLowerCase();
  const textBlob = input.text_signals.join(" ").toLowerCase();
  const nearTop = input.box.y <= Math.max(80, input.viewportHeight * 0.45);
  const hasMedia = /(^|>)media(>|$)/.test(input.signature);
  const hasHeading = input.signature.includes("heading");
  const hasCta = input.signature.includes("cta");
  const hasForm = input.signature.includes("form");
  const hasList = input.signature.includes("list");
  const hasNav = input.signature.includes("nav") || tag === "nav" || tag === "header";
  const roles = input.signature.split(">").filter(Boolean);
  const mediaOnly =
    roles.length > 0 && roles.every((role) => role === "media" || role === "media_large");
  const tallMedia =
    hasMedia && input.box.height >= Math.max(260, input.viewportHeight * 0.32);
  const socialProofText = /testimonial|review|customer|kunde|quote|partner logo|trusted by|as seen/.test(
    textBlob
  );

  if (tag === "header" || (hasNav && nearTop && input.box.height < 160)) {
    return { taxonomy_id: "dig:section.global_nav", category: "nav", confidence: 0.9, method: "header_nav_heuristic" };
  }
  if (tag === "footer" || (hasNav && input.box.y > input.viewportHeight)) {
    return { taxonomy_id: "dig:section.footer", category: "nav", confidence: 0.88, method: "footer_heuristic" };
  }
  if (hasForm && /sign|log|email|subscribe|newsletter|demo|contact/.test(textBlob)) {
    const id = /newsletter|subscribe/.test(textBlob)
      ? "dig:section.cta_newsletter"
      : /demo/.test(textBlob)
        ? "dig:section.cta_demo"
        : /contact/.test(textBlob)
          ? "dig:section.contact"
          : "dig:section.lead_form";
    return { taxonomy_id: id, category: getTaxonomyTerm(id)?.category ?? "form", confidence: 0.82, method: "form_text_heuristic" };
  }
  if (/faq|häufig|questions/.test(textBlob) && hasList) {
    return { taxonomy_id: "dig:section.faq", category: "content", confidence: 0.84, method: "faq_heuristic" };
  }
  if (/price|pricing|plan|€|\$|monat|month/.test(textBlob) && (hasList || hasCta)) {
    return { taxonomy_id: "dig:section.pricing", category: "commerce", confidence: 0.83, method: "pricing_heuristic" };
  }
  if (socialProofText) {
    return { taxonomy_id: "dig:section.testimonials", category: "social_proof", confidence: 0.8, method: "testimonial_heuristic" };
  }
  // Full-bleed / tall media above the fold is hero even when overlay text was not measured as heading.
  if (nearTop && tallMedia && !socialProofText) {
    const taxonomy_id =
      hasHeading && hasCta
        ? hasMedia && input.signature.startsWith("media")
          ? "dig:section.hero_media_above"
          : "dig:section.hero_split_cta"
        : mediaOnly || input.signature.startsWith("media")
          ? "dig:section.hero_media_above"
          : hasCta
            ? "dig:section.hero"
            : "dig:section.hero_centered";
    return {
      taxonomy_id,
      category: "hero",
      confidence: hasHeading || hasCta ? 0.86 : 0.8,
      method: hasHeading || hasCta ? "hero_position_heuristic" : "hero_tall_media_heuristic"
    };
  }
  if (nearTop && hasHeading && (hasMedia || hasCta)) {
    const taxonomy_id = hasMedia && input.signature.startsWith("media")
      ? "dig:section.hero_media_above"
      : hasMedia
        ? "dig:section.hero_split_cta"
        : hasCta
          ? "dig:section.hero"
          : "dig:section.hero_centered";
    return {
      taxonomy_id,
      category: "hero",
      confidence: 0.86,
      method: "hero_position_heuristic"
    };
  }
  if (hasMedia && hasHeading && hasCta) {
    return {
      taxonomy_id: "dig:section.feature_spotlight",
      category: "feature",
      confidence: 0.78,
      method: "media_heading_cta_heuristic"
    };
  }
  // Mid-page tall media blocks are features/content, not logo marquees.
  if (tallMedia && mediaOnly && !socialProofText) {
    return {
      taxonomy_id: "dig:section.feature_spotlight",
      category: "feature",
      confidence: 0.72,
      method: "tall_media_block_heuristic"
    };
  }
  if (hasHeading && hasList && !hasForm) {
    return {
      taxonomy_id: "dig:section.feature_grid",
      category: "feature",
      confidence: 0.74,
      method: "heading_list_heuristic"
    };
  }
  if (hasHeading && hasCta && !hasMedia) {
    return {
      taxonomy_id: "dig:section.cta_band",
      category: "conversion",
      confidence: 0.76,
      method: "heading_cta_heuristic"
    };
  }

  const catalog = getCatalogEntries().filter((entry) => entry.entity_type === "section" || entry.entity_type === "pattern");
  let best: { entry: CatalogEntry; score: number } | null = null;
  for (const entry of catalog) {
    const hints = entry.composition_hints ?? [];
    if (!hints.length) continue;
    // ["media"] alone matches almost every image band — skip for tall/near-top blocks.
    const onlyBroadMedia = hints.every(
      (hint) => hint.length === 1 && (hint[0] === "media" || hint[0] === "media_large")
    );
    if (onlyBroadMedia && (tallMedia || nearTop) && entry.category === "social_proof") {
      continue;
    }
    // Bare body/unknown signatures should not become social_proof via weak catalog hints.
    if (
      entry.category === "social_proof" &&
      (input.signature === "body" || input.signature === "unknown") &&
      !socialProofText
    ) {
      continue;
    }
    const score = Math.max(...hints.map((hint) => hintScore(input.signature, hint)));
    if (score < 0.66) continue;
    if (!best || score > best.score) best = { entry, score };
  }
  if (best) {
    return {
      taxonomy_id: best.entry.id,
      category: best.entry.category,
      confidence: Math.min(0.9, 0.55 + best.score * 0.35),
      method: "catalog_composition_hint"
    };
  }

  if (tag === "article") {
    return { taxonomy_id: "dig:section.article", category: "content", confidence: 0.8, method: "article_tag" };
  }
  return {
    taxonomy_id: "dig:section.content_block",
    category: "content",
    confidence: 0.55,
    method: "fallback_content_block"
  };
}

export function deriveViewportSectionCompositions(input: {
  viewport_capture_id: string;
  viewport_name: string;
  viewport_height: number;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
  styles: MeasuredStyle[];
}): SectionComposition[] {
  const boxes = boxMap(input.boxes);
  const styles = styleMap(input.styles);
  const children = childrenMap(input.nodes);
  const roots = detectSectionRoots(input.nodes, boxes, input.viewport_height);
  const sections: SectionComposition[] = [];

  for (const root of roots) {
    const box = boxes.get(root.node_id);
    if (!box) continue;
    const { recipe, signature, text_signals } = buildRecipe(root, children, boxes, styles);
    const classified = classifySection({
      root,
      box,
      signature,
      text_signals,
      viewportHeight: input.viewport_height,
      styles,
      children
    });
    sections.push({
      section_id: id("sec", `${input.viewport_capture_id}|${root.node_id}|${signature}`),
      viewport_capture_id: input.viewport_capture_id,
      viewport_name: input.viewport_name,
      root_node_id: root.node_id,
      taxonomy_id: classified.taxonomy_id,
      category: classified.category,
      confidence: classified.confidence,
      method: classified.method,
      recipe,
      signature,
      text_signals,
      layer: classified.confidence >= 0.8 ? "L2" : "L3"
    });
  }
  return sections;
}

export function clusterSectionCompositions(sections: SectionComposition[]): SectionCompositionCluster[] {
  const groups = new Map<string, SectionCompositionCluster>();
  for (const section of sections) {
    const key = `${section.signature}|${section.category}|${section.taxonomy_id}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        signature: section.signature,
        category: section.category,
        taxonomy_id: section.taxonomy_id,
        count: 1,
        viewport_names: [section.viewport_name],
        example_text_signals: section.text_signals.slice(0, 4)
      });
      continue;
    }
    existing.count += 1;
    if (!existing.viewport_names.includes(section.viewport_name)) existing.viewport_names.push(section.viewport_name);
    for (const signal of section.text_signals) {
      if (existing.example_text_signals.length >= 4) break;
      if (!existing.example_text_signals.includes(signal)) existing.example_text_signals.push(signal);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

export function deriveSectionCompositionsDocument(viewports: Array<{
  viewport_capture_id: string;
  viewport_name: string;
  viewport_height: number;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
  styles: MeasuredStyle[];
}>): SectionCompositionDocument {
  const viewportSections = viewports.map((viewport) => ({
    viewport_capture_id: viewport.viewport_capture_id,
    viewport_name: viewport.viewport_name,
    sections: deriveViewportSectionCompositions(viewport)
  }));
  const all = viewportSections.flatMap((item) => item.sections);
  return {
    schema_version: "0.1.0",
    section_composition_version: SECTION_COMPOSITION_VERSION,
    generated_at: new Date().toISOString(),
    viewports: viewportSections,
    clusters: clusterSectionCompositions(all)
  };
}
