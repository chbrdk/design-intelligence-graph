/**
 * DIG-012 Wave 1 — emit derived/design-references.jsonl from section_look.
 * Dummy/local mode: no Collection scope required.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { writeArtifact } from "./io.js";
import type { LlmDesignAnalysis } from "./llm-design.js";
import type { SectionLookDescription } from "./section-look.js";
import { rolesFromSignature } from "./design-reference-spec.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";
import { validateAgainstSchema } from "./flow-schema-validate.js";

export const DESIGN_REFERENCE_SCHEMA_VERSION = "0.1.0" as const;
export const DESIGN_REFERENCES_RELATIVE_PATH = "derived/design-references.jsonl";

export type DesignReferenceRecord = {
  schema_version: typeof DESIGN_REFERENCE_SCHEMA_VERSION;
  reference_id: string;
  capture_run_id: string;
  scope: "section" | "screen";
  section_id: string | null;
  viewport_capture_id: string | null;
  taxonomy: {
    category: string;
    taxonomy_ids?: string[];
    screen_patterns?: string[];
  };
  composition: {
    signature: string;
    stack_summary: string;
    roles?: string[];
  };
  look: {
    look_summary: string;
    interaction_summary?: string;
    background?: SectionLookDescription["background"];
    overlay?: SectionLookDescription["overlay"];
    shadows?: SectionLookDescription["shadows"];
    typography_emphasis?: SectionLookDescription["typography_emphasis"];
    alignment?: SectionLookDescription["alignment"];
    media?: SectionLookDescription["media"];
    confidence: number;
  };
  tokens?: {
    style_labels?: string[];
  };
  page_context?: {
    visual_style_labels?: string[];
    design_summary?: string;
  };
  provenance: {
    evidence_refs: string[];
    methods: string[];
    layers: string[];
  };
};

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function categoryToTaxonomyIds(category: string): string[] {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) return ["dig:pattern.unknown"];
  if (normalized.includes("hero")) return ["dig:pattern.hero"];
  if (normalized.includes("login") || normalized.includes("auth")) return ["dig:pattern.auth"];
  if (normalized.includes("pricing")) return ["dig:pattern.pricing"];
  if (normalized.includes("nav")) return ["dig:pattern.navigation"];
  return [`dig:pattern.${normalized.slice(0, 48)}`];
}

export function referenceIdForSection(captureRunId: string, sectionId: string): string {
  const digest = createHash("sha256").update(`${captureRunId}|${sectionId}`).digest("hex").slice(0, 12);
  return `ref_${sectionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}_${digest}`;
}

export function designReferenceFromSectionLook(input: {
  captureRunId: string;
  description: SectionLookDescription;
  viewportCaptureId?: string | null;
  screenPatterns?: string[];
  visualStyleLabels?: string[];
  designSummary?: string;
}): DesignReferenceRecord {
  const category = input.description.category?.trim() || "unknown";
  const roles = rolesFromSignature(input.description.signature);
  const lookSummary = truncate(input.description.look_summary || input.description.stack_summary, 400);
  const stackSummary = truncate(input.description.stack_summary || lookSummary, 200);
  const evidence = (input.description.evidence_refs ?? []).slice(0, 24);
  const record: DesignReferenceRecord = {
    schema_version: DESIGN_REFERENCE_SCHEMA_VERSION,
    reference_id: referenceIdForSection(input.captureRunId, input.description.section_id),
    capture_run_id: input.captureRunId,
    scope: "section",
    section_id: input.description.section_id,
    viewport_capture_id: input.viewportCaptureId ?? null,
    taxonomy: {
      category,
      taxonomy_ids: categoryToTaxonomyIds(category),
      ...(input.screenPatterns?.length ? { screen_patterns: input.screenPatterns.slice(0, 8) } : {})
    },
    composition: {
      signature: input.description.signature,
      stack_summary: stackSummary,
      ...(roles.length ? { roles } : {})
    },
    look: {
      look_summary: lookSummary,
      confidence: Math.min(1, Math.max(0, Number(input.description.confidence) || 0)),
      ...(input.description.interaction_summary
        ? { interaction_summary: truncate(input.description.interaction_summary, 400) }
        : {}),
      ...(input.description.background ? { background: input.description.background } : {}),
      ...(input.description.overlay ? { overlay: input.description.overlay } : {}),
      ...(input.description.shadows ? { shadows: input.description.shadows } : {}),
      ...(input.description.typography_emphasis
        ? { typography_emphasis: input.description.typography_emphasis }
        : {}),
      ...(input.description.alignment ? { alignment: input.description.alignment } : {}),
      ...(input.description.media ? { media: input.description.media } : {})
    },
    provenance: {
      evidence_refs: evidence.length ? evidence : [input.description.section_id],
      methods: ["section_look"],
      layers: ["L2", "L3"]
    }
  };
  if (input.visualStyleLabels?.length) {
    record.tokens = { style_labels: input.visualStyleLabels.slice(0, 8) };
  }
  if (input.designSummary || input.visualStyleLabels?.length) {
    record.page_context = {
      ...(input.visualStyleLabels?.length
        ? { visual_style_labels: input.visualStyleLabels.slice(0, 8) }
        : {}),
      ...(input.designSummary ? { design_summary: truncate(input.designSummary, 400) } : {})
    };
  }
  return record;
}

export function designReferencesFromLlmAnalysis(
  captureRunId: string,
  llm: LlmDesignAnalysis,
  viewportCaptureId?: string | null
): DesignReferenceRecord[] {
  const descriptions = llm.mobbin?.section_descriptions ?? [];
  const screenPatterns = (llm.mobbin?.screen_patterns ?? []).map((item) => item.name).filter(Boolean);
  const visualStyleLabels = (llm.mobbin?.visual_style_labels ?? [])
    .map((item) => item.name)
    .filter(Boolean);
  return descriptions.map((description) =>
    designReferenceFromSectionLook({
      captureRunId,
      description,
      ...(viewportCaptureId !== undefined ? { viewportCaptureId } : {}),
      screenPatterns,
      visualStyleLabels,
      designSummary: llm.design_summary
    })
  );
}

export async function emitDesignReferencesForPackage(
  packageRoot: string
): Promise<{ path: string; count: number; references: DesignReferenceRecord[] }> {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
  const llmPath = manifest.run_artifacts.llm_design?.path ?? "derived/llm-design.json";
  let llm: LlmDesignAnalysis | null = null;
  try {
    llm = JSON.parse(await readFile(resolve(packageRoot, llmPath), "utf8")) as LlmDesignAnalysis;
  } catch {
    llm = null;
  }
  const viewportCaptureId = manifest.viewport_captures[0]?.viewport_capture_id ?? null;
  const references = llm
    ? designReferencesFromLlmAnalysis(manifest.capture_run_id, llm, viewportCaptureId)
    : [];

  for (const reference of references) {
    const issues = validateAgainstSchema("designReference", reference);
    if (issues.length) {
      throw new Error(
        `Invalid DesignReference ${reference.reference_id}: ${issues.map((i) => i.message).join("; ")}`
      );
    }
  }

  const body = references.map((row) => JSON.stringify(row)).join("\n") + (references.length ? "\n" : "");
  const artifact = await writeArtifact(
    packageRoot,
    DESIGN_REFERENCES_RELATIVE_PATH,
    body,
    "application/x-ndjson"
  );

  const runArtifacts: Record<string, ArtifactReference> = {
    ...manifest.run_artifacts,
    design_references: artifact
  };
  const updatedManifest: CaptureManifest = {
    ...manifest,
    run_artifacts: runArtifacts
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(updatedManifest, null, 2), "application/json");

  return { path: DESIGN_REFERENCES_RELATIVE_PATH, count: references.length, references };
}
