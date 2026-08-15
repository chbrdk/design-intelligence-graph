import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ONTOLOGY_VERSION = "0.2.0";

export type OntologyEntityType =
  | "page"
  | "region"
  | "section"
  | "component"
  | "element"
  | "content"
  | "ux_pattern"
  | "pattern";

export interface TaxonomyTerm {
  entity_type: OntologyEntityType;
  label: string;
  category?: string;
  aliases?: string[];
  composition_hints?: string[][];
}

/** Core terms always available even if the catalog file is missing. */
export const CORE_TAXONOMY: Record<string, TaxonomyTerm> = {
  "dig:page.unknown": { entity_type: "page", label: "Unknown page", category: "content" },
  "dig:page.content": { entity_type: "page", label: "Content page", category: "content" },
  "dig:page.landing": { entity_type: "page", label: "Landing page", category: "content" },
  "dig:region.banner": { entity_type: "region", label: "Banner", category: "nav" },
  "dig:region.navigation": { entity_type: "region", label: "Navigation", category: "nav" },
  "dig:region.main": { entity_type: "region", label: "Main content", category: "nav" },
  "dig:region.complementary": { entity_type: "region", label: "Complementary content", category: "nav" },
  "dig:region.contentinfo": { entity_type: "region", label: "Content information", category: "nav" },
  "dig:section.generic": { entity_type: "section", label: "Section", category: "content" },
  "dig:section.article": { entity_type: "section", label: "Article", category: "content" },
  "dig:component.navigation": { entity_type: "component", label: "Navigation component", category: "nav" },
  "dig:component.form": { entity_type: "component", label: "Form", category: "form" },
  "dig:component.form_control": { entity_type: "component", label: "Form control", category: "form" },
  "dig:component.button": { entity_type: "component", label: "Button", category: "conversion" },
  "dig:component.link": { entity_type: "component", label: "Link", category: "nav" },
  "dig:component.media": { entity_type: "component", label: "Media", category: "media" },
  "dig:component.embed": { entity_type: "component", label: "Embedded content", category: "media" },
  "dig:component.list": { entity_type: "component", label: "List", category: "content" },
  "dig:component.list_item": { entity_type: "component", label: "List item", category: "content" },
  "dig:component.table": { entity_type: "component", label: "Table", category: "app" },
  "dig:component.dialog": { entity_type: "component", label: "Dialog", category: "feedback" },
  "dig:component.disclosure": { entity_type: "component", label: "Disclosure", category: "content" },
  "dig:component.tabs": { entity_type: "component", label: "Tabs", category: "content" },
  "dig:component.search": { entity_type: "component", label: "Search", category: "form" },
  "dig:component.figure": { entity_type: "component", label: "Figure", category: "media" },
  "dig:element.container": { entity_type: "element", label: "Container", category: "content" },
  "dig:element.decorative": { entity_type: "element", label: "Decorative element", category: "content" },
  "dig:content.heading": { entity_type: "content", label: "Heading", category: "content" },
  "dig:content.body_text": { entity_type: "content", label: "Body text", category: "content" },
  "dig:content.label": { entity_type: "content", label: "Label", category: "form" },
  "dig:content.caption": { entity_type: "content", label: "Caption", category: "content" },
  "dig:content.quote": { entity_type: "content", label: "Quote", category: "content" },
  "dig:content.code": { entity_type: "content", label: "Code", category: "content" },
  "dig:pattern.hero": { entity_type: "ux_pattern", label: "Hero", category: "hero" },
  "dig:pattern.primary_action": { entity_type: "ux_pattern", label: "Primary action", category: "conversion" },
  "dig:pattern.sticky_header": { entity_type: "ux_pattern", label: "Sticky header", category: "nav" },
  "dig:pattern.navigation": { entity_type: "ux_pattern", label: "Navigation pattern", category: "nav" },
  "dig:pattern.form": { entity_type: "ux_pattern", label: "Form pattern", category: "form" },
  "dig:pattern.embedded_content": { entity_type: "ux_pattern", label: "Embedded content pattern", category: "media" },
  "dig:pattern.accordion": { entity_type: "ux_pattern", label: "Accordion", category: "content" },
  "dig:pattern.tabs": { entity_type: "ux_pattern", label: "Tabs", category: "content" },
  "dig:pattern.modal": { entity_type: "ux_pattern", label: "Modal dialog", category: "feedback" },
  "dig:pattern.search": { entity_type: "ux_pattern", label: "Search pattern", category: "form" },
  "dig:pattern.breadcrumb": { entity_type: "ux_pattern", label: "Breadcrumb", category: "nav" },
  "dig:pattern.card_grid": { entity_type: "ux_pattern", label: "Card grid", category: "feature" }
};

export type TaxonomyId = string;

export interface CatalogEntry {
  id: string;
  entity_type: OntologyEntityType | "pattern";
  category: string;
  label: string;
  aliases?: string[];
  composition_hints?: string[][];
}

export interface SectionComponentCatalog {
  schema_version: string;
  catalog_version: string;
  entries: CatalogEntry[];
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolveCatalogPath(): string {
  try {
    const paths = JSON.parse(readFileSync(resolve(ROOT, "knowledge/paths.json"), "utf8")) as {
      taxonomy?: { sectionComponentCatalog?: string };
    };
    const relative = paths.taxonomy?.sectionComponentCatalog ?? "knowledge/section-component-catalog.json";
    return resolve(ROOT, relative);
  } catch {
    return resolve(ROOT, "knowledge/section-component-catalog.json");
  }
}

function normalizeEntityType(value: string): OntologyEntityType {
  if (value === "pattern") return "ux_pattern";
  if (
    value === "page" ||
    value === "region" ||
    value === "section" ||
    value === "component" ||
    value === "element" ||
    value === "content" ||
    value === "ux_pattern"
  ) {
    return value;
  }
  return "component";
}

function loadCatalogEntries(): CatalogEntry[] {
  try {
    const raw = JSON.parse(readFileSync(resolveCatalogPath(), "utf8")) as SectionComponentCatalog;
    return Array.isArray(raw.entries) ? raw.entries : [];
  } catch {
    return [];
  }
}

function buildMergedTaxonomy(): Record<string, TaxonomyTerm> {
  const merged: Record<string, TaxonomyTerm> = { ...CORE_TAXONOMY };
  for (const entry of loadCatalogEntries()) {
    if (!entry?.id || typeof entry.id !== "string") continue;
    merged[entry.id] = {
      entity_type: normalizeEntityType(String(entry.entity_type)),
      label: entry.label || entry.id,
      ...(entry.category ? { category: entry.category } : {}),
      ...(entry.aliases ? { aliases: entry.aliases } : {}),
      ...(entry.composition_hints ? { composition_hints: entry.composition_hints } : {})
    };
  }
  return merged;
}

/** Merged core + section/component catalog. */
export const TAXONOMY: Record<string, TaxonomyTerm> = buildMergedTaxonomy();

let catalogCache: CatalogEntry[] | null = null;

export function getCatalogEntries(): CatalogEntry[] {
  if (!catalogCache) catalogCache = loadCatalogEntries();
  return catalogCache;
}

export function getTaxonomyTerm(id: string): TaxonomyTerm | undefined {
  return TAXONOMY[id];
}

export function isTaxonomyId(value: string): value is TaxonomyId {
  return value in TAXONOMY;
}

/** @deprecated Prefer CORE_TAXONOMY / TAXONOMY merge; kept as alias for older imports. */
export { CORE_TAXONOMY as LEGACY_CORE_TAXONOMY };
