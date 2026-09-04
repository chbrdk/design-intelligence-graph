/**
 * Closed screen-pattern taxonomy (Mobbin-parity filters without Mobbin content).
 * @see knowledge/mobbin-parity-taxonomy-gaps.md
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveRepoRoot } from "./repo-root.js";

export const SCREEN_PATTERNS_VERSION = "0.1.0";

export type ScreenPatternTerm = {
  id: string;
  label: string;
  aliases: string[];
};

type ScreenPatternsCatalogFile = {
  version: string;
  idPrefix: string;
  patterns: Array<{ id: string; label: string; aliases?: string[] }>;
};

const ROOT = resolveRepoRoot();

function resolveCatalogPath(): string {
  try {
    const paths = JSON.parse(readFileSync(resolve(ROOT, "knowledge/paths.json"), "utf8")) as {
      taxonomy?: { screenPatternsCatalog?: string };
    };
    const relative = paths.taxonomy?.screenPatternsCatalog ?? "knowledge/screen-patterns-catalog.json";
    return resolve(ROOT, relative);
  } catch {
    return resolve(ROOT, "knowledge/screen-patterns-catalog.json");
  }
}

function loadCatalog(): ScreenPatternsCatalogFile {
  const parsed = JSON.parse(readFileSync(resolveCatalogPath(), "utf8")) as ScreenPatternsCatalogFile;
  if (!Array.isArray(parsed.patterns)) throw new Error("screen-patterns catalog missing patterns[]");
  return parsed;
}

let cached: ScreenPatternsCatalogFile | null = null;

export function getScreenPatternsCatalog(): ScreenPatternsCatalogFile {
  if (!cached) cached = loadCatalog();
  return cached;
}

export function resetScreenPatternsCatalogCache(): void {
  cached = null;
}

export function listScreenPatterns(): ScreenPatternTerm[] {
  return getScreenPatternsCatalog().patterns.map((item) => ({
    id: item.id,
    label: item.label,
    aliases: item.aliases ?? []
  }));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[_|/-]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchesLabel(hay: string, needle: string): boolean {
  if (!needle) return false;
  if (hay === needle) return true;
  // Prefer word-ish boundaries so short labels (Chat, Form, Map) don't hit substrings.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(hay);
}

/** Map free-text LLM / query labels onto closed screen pattern ids (without dig:screen. prefix → label slug). */
export function normalizeScreenPatternLabel(raw: string | null | undefined): string | null {
  const hay = slug(raw ?? "");
  if (!hay) return null;
  for (const term of listScreenPatterns()) {
    if (term.id === "dig:screen.unknown") continue;
    const label = slug(term.label);
    if (matchesLabel(hay, label)) return term.label;
    for (const alias of term.aliases) {
      if (matchesLabel(hay, slug(alias))) return term.label;
    }
  }
  return null;
}

export function normalizeScreenPatternLabels(values: string[] | null | undefined, cap = 5): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    const label = normalizeScreenPatternLabel(value);
    if (!label || out.includes(label)) continue;
    out.push(label);
    if (out.length >= cap) break;
  }
  return out;
}

export function screenPatternFilterCatalog(): string[] {
  return listScreenPatterns()
    .filter((term) => term.id !== "dig:screen.unknown")
    .map((term) => term.label);
}
