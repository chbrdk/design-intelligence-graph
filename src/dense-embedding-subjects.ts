/**
 * Build Stage B dense embedding documents from an enriched capture package.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildModuleEmbeddingCanonical,
  buildScreenEmbeddingCanonical
} from "./dense-embedding-canonical.js";
import {
  canonicalSha256,
  type DenseEmbeddingSubject
} from "./dense-embeddings.js";
import {
  buildDesignFacets,
  designFacetsHaveSignal,
  summarizeDesignFacets
} from "./design-facets.js";
import type { LlmDesignAnalysis } from "./llm-design.js";
import { loadDesignTokensDocument } from "./design-tokens.js";
import { loadPageRhythmForPackage } from "./page-rhythm.js";
import { loadDigPaths } from "./runtime-paths.js";
import type { SectionLookDescription } from "./section-look.js";
import { loadVisionPageDocument } from "./vision-page.js";

const SKIP_MODULE_CATEGORIES = new Set(["content", "body"]);

function moduleCategories(root = process.cwd()): Set<string> {
  const configured = loadDigPaths(root).libraryModuleGallery?.categories ?? [];
  return new Set(configured.map((item) => item.trim().toLowerCase()).filter(Boolean));
}

async function loadLlmDesign(packageRoot: string): Promise<LlmDesignAnalysis | null> {
  try {
    const raw = await readFile(resolve(packageRoot, "derived/llm-design.json"), "utf8");
    return JSON.parse(raw) as LlmDesignAnalysis;
  } catch {
    return null;
  }
}

function sectionLooks(llm: LlmDesignAnalysis | null): SectionLookDescription[] {
  return (llm?.mobbin?.section_descriptions ?? []).filter(
    (item): item is SectionLookDescription => Boolean(item?.section_id && item.look_summary?.trim())
  );
}

function rhythmSummary(pageRhythm: Awaited<ReturnType<typeof loadPageRhythmForPackage>>): string | null {
  if (!pageRhythm) return null;
  const arc = pageRhythm.page_arc?.trim();
  const summary = pageRhythm.above_fold?.summary?.trim();
  if (arc && summary) return `${arc} · ${summary}`;
  return arc || summary || null;
}

export async function buildDenseEmbeddingSubjects(
  packageRoot: string,
  captureRunId: string,
  root = process.cwd()
): Promise<DenseEmbeddingSubject[]> {
  const llm = await loadLlmDesign(packageRoot);
  if (!llm || llm.status !== "complete") return [];

  const [visionPage, pageRhythm, tokens, packageHints] = await Promise.all([
    loadVisionPageDocument(packageRoot).catch(() => null),
    loadPageRhythmForPackage(packageRoot).catch(() => null),
    loadDesignTokensDocument(packageRoot).catch(() => null),
    readFile(resolve(packageRoot, "manifest.json"), "utf8")
      .then((raw) => {
        const manifest = JSON.parse(raw) as {
          canonical_url?: string;
          site_domain?: string;
          url?: string;
        };
        return {
          canonical_url: manifest.canonical_url ?? manifest.url ?? null,
          site_domain: manifest.site_domain ?? null
        };
      })
      .catch(() => ({ canonical_url: null as string | null, site_domain: null as string | null }))
  ]);

  const facets = buildDesignFacets({
    vision_page: visionPage,
    screen_pattern_labels: (llm.mobbin?.screen_patterns ?? [])
      .map((item) => String(item.name ?? "").trim())
      .filter(Boolean),
    visual_style_labels: (llm.mobbin?.visual_style_labels ?? [])
      .map((item) => String(item.name ?? "").trim())
      .filter(Boolean),
    design_summary: llm.design_summary ?? null,
    tokens,
    site_domain: packageHints.site_domain,
    canonical_url: packageHints.canonical_url
  });
  if (!designFacetsHaveSignal(facets)) return [];

  const summary = summarizeDesignFacets(facets);
  const allowedModules = moduleCategories(root);
  const looks = sectionLooks(llm);
  const moduleSignatures = looks
    .map((item) => String(item.signature ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);

  const subjects: DenseEmbeddingSubject[] = [];
  const screenText = buildScreenEmbeddingCanonical({
    industry: summary.industry_tags?.[0] ?? null,
    style: summary.style,
    layout: summary.layout,
    craft_tags: summary.craft_tags ?? null,
    imagery_density: summary.imagery_density ?? null,
    type_scale: summary.type_scale ?? null,
    type_image_mode: summary.type_image_mode ?? null,
    contrast_mode: summary.contrast_mode ?? null,
    composition_energy: summary.composition_energy ?? null,
    chrome_weight: summary.chrome_weight ?? null,
    value_key: summary.value_key ?? null,
    palette: summary.palette ?? null,
    screen_patterns: summary.screen_patterns ?? null,
    look_summary: llm.design_summary || visionPage?.overall_atmosphere || null,
    design_summary: llm.design_summary || null,
    rhythm_summary: rhythmSummary(pageRhythm),
    module_signatures: moduleSignatures
  });
  if (screenText.trim()) {
    subjects.push({
      subject_kind: "screen",
      subject_id: captureRunId,
      content_text: screenText,
      canonical_sha256: canonicalSha256(screenText)
    });
  }

  const seenModules = new Set<string>();
  for (const look of looks) {
    const category = String(look.category ?? "").trim().toLowerCase();
    if (!category || SKIP_MODULE_CATEGORIES.has(category)) continue;
    if (allowedModules.size && !allowedModules.has(category)) continue;
    const subjectId = look.section_id.trim();
    if (!subjectId || seenModules.has(subjectId)) continue;
    seenModules.add(subjectId);
    const moduleText = buildModuleEmbeddingCanonical({
      category,
      signature: look.signature,
      craft_tags: summary.craft_tags ?? null,
      imagery_density: summary.imagery_density ?? null,
      type_scale: summary.type_scale ?? null,
      type_image_mode: summary.type_image_mode ?? null,
      contrast_mode: summary.contrast_mode ?? null,
      look_summary: look.look_summary
    });
    if (!moduleText.trim()) continue;
    subjects.push({
      subject_kind: "module",
      subject_id: subjectId,
      content_text: moduleText,
      canonical_sha256: canonicalSha256(moduleText)
    });
  }

  return subjects;
}
