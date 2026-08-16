/**
 * Structure spine — ordered page bands for rebuild (demote thin wrappers).
 * Complements section compositions / section_look with a human-usable band list.
 */

import { writeArtifact } from "./io.js";
import type {
  RoleStep,
  SectionComposition,
  SectionCompositionDocument
} from "./section-composition.js";
import type { SectionLookDescription } from "./section-look.js";
import type { ArtifactReference } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";

export const STRUCTURE_SPINE_VERSION = "0.1.0";
export const STRUCTURE_SPINE_RELATIVE_PATH = "derived/structure-spine.json";

export type StructureBandZone = "above_fold" | "mid" | "below";

export interface StructureBand {
  section_id: string;
  category: string;
  signature: string;
  beat: string;
  zone: StructureBandZone;
  confidence: number;
  y: number;
  height: number;
}

export interface AboveFoldRecipe {
  ingredients: Array<"media" | "brand" | "headline" | "cta" | "chrome" | "other">;
  summary: string;
  section_ids: string[];
}

export interface StructureSpineDocument {
  schema_version: "0.1.0";
  structure_spine_version: typeof STRUCTURE_SPINE_VERSION;
  generated_at: string;
  source: {
    viewport_name: string;
    viewport_capture_id: string;
    section_compositions_path: string;
  };
  page_arc: string;
  above_fold: AboveFoldRecipe;
  bands: StructureBand[];
  demoted_count: number;
  demoted_samples: Array<{ section_id: string; category: string; signature: string; reason: string }>;
}

function rootBox(section: SectionComposition): { y: number; height: number; width: number } {
  const boxes = section.recipe
    .filter((step): step is RoleStep => step.kind === "role")
    .map((step) => step.box);
  if (!boxes.length) return { y: 0, height: 0, width: 0 };
  const y = Math.min(...boxes.map((box) => box.y));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const width = Math.max(...boxes.map((box) => box.width));
  return { y, height: Math.max(0, bottom - y), width };
}

export function isThinWrapperSection(section: SectionComposition): { demote: boolean; reason?: string } {
  if (section.category === "cookie_consent") return { demote: true, reason: "cookie_consent" };
  const signature = section.signature || "unknown";
  const thin = signature === "body" || signature === "unknown";
  const blob = section.text_signals.join(" ").toLowerCase();
  const box = rootBox(section);
  const cue =
    /model|produkt|product|preis|€|\$|shop|konfigur|entdeck|kaufen|anmeld|cta|mehr erfahren|warenkorb|cart|login/.test(
      blob
    );
  if (thin && box.height > 0 && box.height < 100) return { demote: true, reason: "thin_short_body" };
  if (thin && (section.category === "commerce" || section.category === "conversion" || section.category === "feedback")) {
    if (!cue) return { demote: true, reason: "thin_commerce_without_cues" };
  }
  if (thin && section.category === "content" && blob.length < 24) {
    return { demote: true, reason: "thin_empty_content" };
  }
  if (section.method === "catalog_composition_hint" && thin && section.confidence >= 0.88 && !cue) {
    if (blob.length < 40) return { demote: true, reason: "catalog_body_overmatch" };
  }
  return { demote: false };
}

function zoneFor(y: number, viewportHeight: number): StructureBandZone {
  if (y < viewportHeight * 0.9) return "above_fold";
  if (y < viewportHeight * 2.2) return "mid";
  return "below";
}

function beatFor(
  section: SectionComposition,
  looks: Map<string, SectionLookDescription>
): string {
  const look = looks.get(section.section_id);
  if (look?.look_summary?.trim()) {
    const vision = look.look_summary.match(/Vision:\s*(.+)$/i)?.[1];
    const raw = (vision || look.look_summary).replace(/\s+/g, " ").trim();
    return raw.slice(0, 140);
  }
  if (look?.stack_summary?.trim()) return look.stack_summary.replace(/\s+/g, " ").trim().slice(0, 120);
  const signal = section.text_signals.find((item) => item.trim().length > 2);
  if (signal) return signal.slice(0, 100);
  return `${section.category} · ${section.signature}`;
}

function ingredientsFromBands(bands: StructureBand[]): AboveFoldRecipe["ingredients"] {
  const set = new Set<AboveFoldRecipe["ingredients"][number]>();
  for (const band of bands) {
    if (band.category === "nav") set.add("chrome");
    if (band.signature.includes("media")) set.add("media");
    if (band.signature.includes("heading") || band.category === "hero") set.add("headline");
    if (band.signature.includes("cta") || band.category === "conversion") set.add("cta");
    if (/brand|logo|crest/i.test(band.beat)) set.add("brand");
  }
  if (!set.size) set.add("other");
  const order: AboveFoldRecipe["ingredients"] = ["media", "brand", "headline", "cta", "chrome", "other"];
  return order.filter((item) => set.has(item));
}

export function deriveStructureSpine(input: {
  sections: SectionComposition[];
  viewportHeight: number;
  viewportName: string;
  viewportCaptureId: string;
  looks?: SectionLookDescription[];
  maxBands?: number;
}): StructureSpineDocument {
  const paths = loadDigPaths() as { structureSpine?: { maxBands?: number } };
  const maxBands = input.maxBands ?? paths.structureSpine?.maxBands ?? 12;
  const looks = new Map((input.looks ?? []).map((item) => [item.section_id, item]));
  const demoted_samples: StructureSpineDocument["demoted_samples"] = [];
  const promoted: StructureBand[] = [];

  const ordered = [...input.sections].sort((a, b) => rootBox(a).y - rootBox(b).y);
  for (const section of ordered) {
    const check = isThinWrapperSection(section);
    if (check.demote) {
      demoted_samples.push({
        section_id: section.section_id,
        category: section.category,
        signature: section.signature,
        reason: check.reason ?? "demoted"
      });
      continue;
    }
    const box = rootBox(section);
    promoted.push({
      section_id: section.section_id,
      category: section.category,
      signature: section.signature,
      beat: beatFor(section, looks),
      zone: zoneFor(box.y, Math.max(1, input.viewportHeight)),
      confidence: section.confidence,
      y: box.y,
      height: box.height
    });
  }

  // Collapse consecutive identical thin-ish category+signature runs.
  const collapsed: StructureBand[] = [];
  for (const band of promoted) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.category === band.category && prev.signature === band.signature && band.signature === "body") {
      continue;
    }
    collapsed.push(band);
  }

  const bands = collapsed.slice(0, maxBands);
  const above = bands.filter((band) => band.zone === "above_fold");
  const ingredients = ingredientsFromBands(above.length ? above : bands.slice(0, 2));
  const page_arc = [...new Set(bands.map((band) => band.category))].slice(0, 8).join(" → ") || "content";
  const above_fold: AboveFoldRecipe = {
    ingredients,
    summary: above.length
      ? above.map((band) => `${band.category}(${band.signature})`).join(" → ")
      : bands[0]
        ? `${bands[0].category}(${bands[0].signature})`
        : "unknown",
    section_ids: above.map((band) => band.section_id)
  };

  return {
    schema_version: "0.1.0",
    structure_spine_version: STRUCTURE_SPINE_VERSION,
    generated_at: new Date().toISOString(),
    source: {
      viewport_name: input.viewportName,
      viewport_capture_id: input.viewportCaptureId,
      section_compositions_path: "derived/section-compositions.json"
    },
    page_arc,
    above_fold,
    bands,
    demoted_count: demoted_samples.length,
    demoted_samples: demoted_samples.slice(0, 12)
  };
}

export function pickSpineViewport(
  doc: SectionCompositionDocument,
  preferredName = "desktop"
): { viewport_name: string; viewport_capture_id: string; sections: SectionComposition[] } | null {
  const preferred =
    doc.viewports.find((item) => item.viewport_name === preferredName) ??
    doc.viewports.find((item) => /desktop/i.test(item.viewport_name)) ??
    doc.viewports[0];
  if (!preferred) return null;
  return {
    viewport_name: preferred.viewport_name,
    viewport_capture_id: preferred.viewport_capture_id,
    sections: preferred.sections
  };
}

export function formatStructureSpineBriefSection(spine: StructureSpineDocument): string {
  const lines: string[] = [];
  lines.push("## Structure spine");
  lines.push("");
  lines.push(`- Page arc: ${spine.page_arc}`);
  lines.push(
    `- Above-fold recipe: ${spine.above_fold.ingredients.join(" + ")} — ${spine.above_fold.summary}`
  );
  lines.push(`- Bands (promoted ${spine.bands.length}, demoted ${spine.demoted_count}):`);
  for (const band of spine.bands.slice(0, 10)) {
    lines.push(`  - **${band.zone}** · ${band.category} · \`${band.signature}\` — ${band.beat}`);
  }
  lines.push("");
  return lines.join("\n");
}

export async function emitStructureSpineForPackage(
  packageRoot: string,
  sectionDoc: SectionCompositionDocument,
  options: {
    looks?: SectionLookDescription[];
    viewportHeights?: Record<string, number>;
  } = {}
): Promise<{ path: string; artifact: ArtifactReference; document: StructureSpineDocument } | null> {
  const picked = pickSpineViewport(sectionDoc);
  if (!picked) return null;
  const height =
    options.viewportHeights?.[picked.viewport_name] ??
    options.viewportHeights?.[picked.viewport_capture_id] ??
    900;
  const document = deriveStructureSpine({
    sections: picked.sections,
    viewportHeight: height,
    viewportName: picked.viewport_name,
    viewportCaptureId: picked.viewport_capture_id,
    ...(options.looks ? { looks: options.looks } : {})
  });
  const relative =
    (loadDigPaths() as { structureSpine?: { relativePath?: string } }).structureSpine?.relativePath ??
    STRUCTURE_SPINE_RELATIVE_PATH;
  const artifact = await writeArtifact(packageRoot, relative, JSON.stringify(document, null, 2), "application/json");
  return { path: relative, artifact, document };
}
