/**
 * Compact rebuild brief from DIG enrichment (section look + vision + page summary).
 * Written to derived/rebuild-brief.md for human / agent handoff.
 */

import { writeArtifact } from "./io.js";
import type { LlmDesignAnalysis } from "./llm-design.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
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
  lines.push("## Page reading");
  lines.push("");
  lines.push(llm.design_summary?.trim() || "_No design_summary_");
  lines.push("");
  if (vision?.status === "complete") {
    lines.push("## Above-the-fold (vision_screen)");
    lines.push("");
    lines.push(`- Heading: ${vision.heading ?? "—"}`);
    lines.push(`- CTA: ${vision.cta ?? "—"}`);
    lines.push(`- Layout: ${(vision.layout_order ?? []).join(" → ") || "—"}`);
    lines.push("");
  }
  lines.push("## Direction");
  lines.push("");
  lines.push(`- Patterns: ${patterns.join(", ") || "—"}`);
  lines.push(`- Style labels: ${styles.join(", ") || "—"}`);
  lines.push(
    `- Flow: ${[...new Set(sections.map((item) => item.category).filter(Boolean))].join(" → ") || "—"}`
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
  const body = buildRebuildBriefMarkdown({
    captureRunId: manifest.capture_run_id,
    url: manifest.canonical_url,
    llm,
    chromeStates
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
