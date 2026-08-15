import type { CaptureManifest } from "./types.js";
import type { RecipeStep, SectionCompositionDocument } from "./section-composition.js";

export const FIGMA_EXPORT_VERSION = "0.1.0";

type Box = { x: number; y: number; width: number; height: number };

export type FigmaExportNode = {
  id: string;
  name: string;
  type: "DOCUMENT" | "FRAME" | "RECTANGLE" | "TEXT";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  characters?: string;
  children?: FigmaExportNode[];
};

export type FigmaExportDocument = {
  schema_version: "0.1.0";
  figma_export_version: typeof FIGMA_EXPORT_VERSION;
  capture_run_id: string;
  canonical_url: string;
  site_domain: string;
  generated_at: string;
  document: FigmaExportNode;
};

function unionBoxes(recipe: RecipeStep[]): Box | null {
  const boxes = recipe
    .filter((step): step is Extract<RecipeStep, { kind: "role" }> => step.kind === "role")
    .map((step) => step.box);
  if (!boxes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function frameFromViewport(input: {
  viewport_capture_id: string;
  name: string;
  width: number;
  height: number;
  sections: SectionCompositionDocument["viewports"][number]["sections"];
  flowLabels: string[];
}): FigmaExportNode {
  const children: FigmaExportNode[] = [];
  for (const section of input.sections) {
    const root = unionBoxes(section.recipe ?? []);
    if (root) {
      children.push({
        id: `rect_${section.section_id}`,
        name: `${section.category}:${section.signature}`,
        type: "RECTANGLE",
        x: root.x,
        y: root.y,
        width: root.width,
        height: root.height
      });
    }
    for (const step of section.recipe ?? []) {
      if (step.kind !== "role") continue;
      children.push({
        id: `role_${section.section_id}_${step.node_id}`,
        name: step.role,
        type: "RECTANGLE",
        x: step.box.x,
        y: step.box.y,
        width: step.box.width,
        height: step.box.height
      });
    }
  }
  input.flowLabels.forEach((label, index) => {
    children.push({
      id: `flow_${input.viewport_capture_id}_${index}`,
      name: `flow:${label}`,
      type: "TEXT",
      x: 24,
      y: 24 + index * 28,
      width: Math.max(160, input.width - 48),
      height: 24,
      characters: label
    });
  });
  return {
    id: `frame_${input.viewport_capture_id}`,
    name: input.name,
    type: "FRAME",
    x: 0,
    y: 0,
    width: input.width,
    height: input.height,
    children
  };
}

export function buildFigmaExport(input: {
  manifest: CaptureManifest;
  sections?: SectionCompositionDocument | null;
  flowLabels?: string[];
  generatedAt?: string;
}): FigmaExportDocument {
  const flowLabels = input.flowLabels ?? [];
  const sectionByViewport = new Map(
    (input.sections?.viewports ?? []).map((viewport) => [viewport.viewport_capture_id, viewport.sections] as const)
  );
  const frames = input.manifest.viewport_captures.map((viewport) =>
    frameFromViewport({
      viewport_capture_id: viewport.viewport_capture_id,
      name: viewport.name,
      width: viewport.viewport.width,
      height: viewport.viewport.height,
      sections:
        sectionByViewport.get(viewport.viewport_capture_id) ??
        (input.sections?.viewports ?? []).find((item) => item.viewport_name === viewport.name)?.sections ??
        [],
      flowLabels
    })
  );
  return {
    schema_version: "0.1.0",
    figma_export_version: FIGMA_EXPORT_VERSION,
    capture_run_id: input.manifest.capture_run_id,
    canonical_url: input.manifest.canonical_url,
    site_domain: input.manifest.site.domain,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    document: {
      id: `doc_${input.manifest.capture_run_id}`,
      name: input.manifest.site.domain,
      type: "DOCUMENT",
      children: frames
    }
  };
}
