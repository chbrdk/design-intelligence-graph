/**
 * Compact rebuild brief from DIG enrichment (section look + vision + page summary).
 * Written to derived/rebuild-brief.md for human / agent handoff.
 */

import { writeArtifact } from "./io.js";
import type { LlmDesignAnalysis } from "./llm-design.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import {
  formatDesignTokensBriefSection,
  type DesignTokensDocument
} from "./design-tokens.js";
import {
  formatStructureSpineBriefSection,
  type StructureSpineDocument
} from "./structure-spine.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const REBUILD_BRIEF_RELATIVE_PATH = "derived/rebuild-brief.md";

export function buildRebuildBriefMarkdown(input: {
  captureRunId: string;
  url: string;
  llm: LlmDesignAnalysis;
  chromeStates?: Array<{
    kind: string;
    label: string;
    open_labels?: string[];
  }>;
  designTokens?: DesignTokensDocument | null;
  structureSpine?: StructureSpineDocument | null;
}): string {
  const llm = input.llm;
  const sections = llm.mobbin?.section_descriptions ?? [];
  const styles = (llm.mobbin?.visual_style_labels ?? []).map((item) => item.name);
  const patterns = (llm.mobbin?.screen_patterns ?? []).map((item) => item.name);
  const vision = llm.vision;
  const heroes = sections.filter((item) => (item.category || "").toLowerCase().includes("hero"));
  const lines: string[] = [];
  lines.push(`# Rebuild brief — ${input.url}`);
  lines.push("");
  lines.push(`Capture: \`${input.captureRunId}\` · generated ${new Date().toISOString()}`);
  lines.push("");
  if (input.designTokens) {
    lines.push(formatDesignTokensBriefSection(input.designTokens).trimEnd());
    lines.push("");
  }
  if (input.structureSpine) {
    lines.push(formatStructureSpineBriefSection(input.structureSpine).trimEnd());
    lines.push("");
  }
  lines.push("## Page reading");
  lines.push("");
  lines.push(llm.design_summary?.trim() || "_No design_summary_");
  lines.push("");
  if (vision?.status === "complete") {
    lines.push("## Above-the-fold (vision_page)");
    lines.push("");
    lines.push(`- Heading: ${vision.heading ?? "—"}`);
    lines.push(`- CTA: ${vision.cta ?? "—"}`);
    lines.push(`- Layout: ${(vision.layout_order ?? []).join(" → ") || "—"}`);
    if (vision.notes) lines.push(`- Notes: ${vision.notes}`);
    lines.push("");
  }
  const page = input.llm.vision_page?.document;
  if (page?.status === "complete") {
    lines.push("## Visual catalog (vision_page)");
    lines.push("");
    lines.push(`- Page type: ${page.page_type || "—"}`);
    lines.push(`- Atmosphere: ${page.overall_atmosphere || "—"}`);
    lines.push(`- Color mood: ${page.color_mood || "—"}`);
    lines.push(`- Type feel: ${page.typography_feel || "—"}`);
    lines.push(`- Media: ${page.media_strategy || "—"}`);
    lines.push(`- Rhythm: ${page.vertical_rhythm || "—"}`);
    if (page.rebuild_hints) lines.push(`- Rebuild: ${page.rebuild_hints}`);
    if (page.category_tags?.length) lines.push(`- Tags: ${page.category_tags.join(", ")}`);
    lines.push("");
  }
  lines.push("## Direction");
  lines.push("");
  lines.push(`- Patterns: ${patterns.join(", ") || "—"}`);
  lines.push(`- Style labels: ${styles.join(", ") || "—"}`);
  lines.push(
    `- Flow: ${
      input.structureSpine?.page_arc ||
      [...new Set(sections.map((item) => item.category).filter(Boolean))].join(" → ") ||
      "—"
    }`
  );
  lines.push("");
  if (input.chromeStates?.length) {
    lines.push("## Chrome IA (open states)");
    lines.push("");
    for (const state of input.chromeStates.slice(0, 6)) {
      const labels = (state.open_labels ?? []).slice(0, 10).join(", ") || "—";
      lines.push(`- **${state.kind}** (${state.label}): ${labels}`);
    }
    lines.push("");
  }
  lines.push("## Hero / media bands");
  lines.push("");
  for (const section of (heroes.length ? heroes : sections).slice(0, 5)) {
    const visionNote = (section.look_summary || "").match(/Vision:\s*(.+)$/i)?.[1];
    lines.push(`### ${section.category} · \`${section.signature}\` · ${section.section_id}`);
    lines.push("");
    lines.push(visionNote ? `Vision: ${visionNote}` : (section.look_summary || section.stack_summary || "").slice(0, 320));
    if (section.media?.role) lines.push(`- Media role: ${section.media.role}${section.media.object_fit ? ` (${section.media.object_fit})` : ""}`);
    if (section.overlay?.present) lines.push(`- Overlay: ${section.overlay.kind ?? "present"} — ${section.overlay.notes ?? ""}`);
    if (section.alignment) lines.push(`- Align: text=${section.alignment.text ?? "?"} cta=${section.alignment.cta ?? "?"}`);
    lines.push("");
  }
  lines.push("## Hypotheses");
  lines.push("");
  for (const hyp of (llm.hypotheses ?? []).slice(0, 8)) {
    lines.push(`- **${hyp.category}**: ${hyp.value} (${hyp.confidence.toFixed(2)}) — ${hyp.rationale}`);
  }
  lines.push("");
  lines.push("## Rebuild constraints");
  lines.push("");
  lines.push("1. One composition first viewport: brand/media hero, one headline, one short line, one CTA group.");
  lines.push("2. Prefer full-bleed photography with dark scrim; avoid card grids in the hero.");
  lines.push("3. Reuse measured signatures as stack recipes; do not invent off-evidence chrome.");
  lines.push("4. Skip cookie/CMP chrome.");
  lines.push("5. Prefer measured chrome IA labels when rebuilding nav/search/cart.");
  lines.push("6. Prefer measured design tokens for fonts/colors/radii/CTA; refuse invented brand chrome when tokens exist.");
  lines.push("7. Follow the structure spine band order; do not invent extra commerce body wrappers.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export async function emitRebuildBriefForPackage(
  packageRoot: string,
  llm: LlmDesignAnalysis
): Promise<{ path: string; artifact: ArtifactReference }> {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
  let chromeStates: Array<{ kind: string; label: string; open_labels?: string[] }> = [];
  try {
    const chromeDoc = JSON.parse(
      await readFile(resolve(packageRoot, "derived/chrome-states.json"), "utf8")
    ) as { states?: Array<{ kind: string; label: string; open_labels?: string[] }> };
    chromeStates = chromeDoc.states ?? [];
  } catch {
    /* optional */
  }
  let designTokens: DesignTokensDocument | null = null;
  try {
    designTokens = JSON.parse(
      await readFile(resolve(packageRoot, "derived/design-tokens.json"), "utf8")
    ) as DesignTokensDocument;
  } catch {
    /* optional */
  }
  let structureSpine: StructureSpineDocument | null = null;
  try {
    structureSpine = JSON.parse(
      await readFile(resolve(packageRoot, "derived/structure-spine.json"), "utf8")
    ) as StructureSpineDocument;
  } catch {
    /* optional */
  }
  const body = buildRebuildBriefMarkdown({
    captureRunId: manifest.capture_run_id,
    url: manifest.canonical_url,
    llm,
    chromeStates,
    designTokens,
    structureSpine
  });
  const artifact = await writeArtifact(packageRoot, REBUILD_BRIEF_RELATIVE_PATH, body, "text/markdown; charset=utf-8");
  const updated: CaptureManifest = {
    ...manifest,
    run_artifacts: {
      ...manifest.run_artifacts,
      rebuild_brief: artifact
    }
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(updated, null, 2), "application/json");
  return { path: REBUILD_BRIEF_RELATIVE_PATH, artifact };
}
