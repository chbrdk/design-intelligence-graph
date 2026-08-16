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
  /** Optional Collection scope when federated. */
  platform_project_id?: string;
  dig_project_id?: string;
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
  media_ref?: {
    kind: "viewport" | "full_page" | "section_crop" | "none";
    path: string | null;
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
  if (normalized.includes("cookie") || normalized.includes("consent")) return ["dig:section.cookie_consent"];
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
  cropPath?: string | null;
}): DesignReferenceRecord {
  const category = input.description.category?.trim() || "unknown";
  const roles = rolesFromSignature(input.description.signature);
  const lookSummary = truncate(input.description.look_summary || input.description.stack_summary, 400);
  const stackSummary = truncate(input.description.stack_summary || lookSummary, 200);
  const evidence = (input.description.evidence_refs ?? []).slice(0, 24);
  const cropPath = input.cropPath?.trim() || null;
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
    media_ref: cropPath
      ? { kind: "section_crop", path: cropPath }
      : { kind: "none", path: null },
    provenance: {
      evidence_refs: evidence.length ? evidence : [input.description.section_id],
      methods: ["section_look", ...(cropPath ? ["section_crop"] : [])],
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
  viewportCaptureId?: string | null,
  cropPaths?: Map<string, string> | Record<string, string>
): DesignReferenceRecord[] {
  const descriptions = llm.mobbin?.section_descriptions ?? [];
  const screenPatterns = (llm.mobbin?.screen_patterns ?? []).map((item) => item.name).filter(Boolean);
  const visualStyleLabels = (llm.mobbin?.visual_style_labels ?? [])
    .map((item) => item.name)
    .filter(Boolean);
  const crops =
    cropPaths instanceof Map
      ? cropPaths
      : new Map(Object.entries(cropPaths ?? {}));
  const fromSections = descriptions.map((description) =>
    designReferenceFromSectionLook({
      captureRunId,
      description,
      ...(viewportCaptureId !== undefined ? { viewportCaptureId } : {}),
      screenPatterns,
      visualStyleLabels,
      designSummary: llm.design_summary,
      cropPath: crops.get(description.section_id) ?? null
    })
  );
  if (fromSections.length) return fromSections;
  // Sparse pages (e.g. example.com) may lack section_look — still emit a screen reference
  // so Collection search / prompt-pack / generate have corpus after enrichment.
  if (!llm.design_summary?.trim()) return [];
  const summary = truncate(llm.design_summary, 400);
  const style = visualStyleLabels[0] ?? screenPatterns[0] ?? "content";
  const record: DesignReferenceRecord = {
    schema_version: DESIGN_REFERENCE_SCHEMA_VERSION,
    reference_id: referenceIdForSection(captureRunId, "screen"),
    capture_run_id: captureRunId,
    scope: "screen",
    section_id: null,
    viewport_capture_id: viewportCaptureId ?? null,
    taxonomy: {
      category: "screen",
      taxonomy_ids: ["dig:pattern.unknown"],
      ...(screenPatterns.length ? { screen_patterns: screenPatterns.slice(0, 8) } : {})
    },
    composition: {
      signature: `screen/${style}`,
      stack_summary: truncate(summary, 200)
    },
    look: {
      look_summary: summary,
      confidence: 0.55
    },
    media_ref: { kind: "none", path: null },
    provenance: {
      evidence_refs: ["screen"],
      methods: ["llm_design_summary"],
      layers: ["L3"]
    }
  };
  if (visualStyleLabels.length) {
    record.tokens = { style_labels: visualStyleLabels.slice(0, 8) };
  }
  record.page_context = {
    ...(visualStyleLabels.length ? { visual_style_labels: visualStyleLabels.slice(0, 8) } : {}),
    design_summary: summary
  };
  return [record];
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
  const cropPaths = new Map<string, string>();
  try {
    const cropsPath = manifest.run_artifacts.section_crops?.path ?? "derived/section-crops.json";
    const cropsDoc = JSON.parse(await readFile(resolve(packageRoot, cropsPath), "utf8")) as {
      crops?: Array<{ section_id?: string; path?: string }>;
    };
    for (const crop of cropsDoc.crops ?? []) {
      if (crop.section_id && crop.path) cropPaths.set(crop.section_id, crop.path);
    }
  } catch {
    /* older packages may lack crops */
  }
  const references = llm
    ? designReferencesFromLlmAnalysis(manifest.capture_run_id, llm, viewportCaptureId, cropPaths)
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

  let embeddingsArtifact: ArtifactReference | undefined;
  if (references.length) {
    const {
      buildDesignReferenceEmbeddingRow,
      DESIGN_REFERENCE_EMBEDDINGS_RELATIVE_PATH
    } = await import("./design-reference-embeddings.js");
    const embBody =
      references.map((ref) => JSON.stringify(buildDesignReferenceEmbeddingRow(ref))).join("\n") + "\n";
    embeddingsArtifact = await writeArtifact(
      packageRoot,
      DESIGN_REFERENCE_EMBEDDINGS_RELATIVE_PATH,
      embBody,
      "application/x-ndjson"
    );
  }

  const runArtifacts: Record<string, ArtifactReference> = {
    ...manifest.run_artifacts,
    design_references: artifact,
    ...(embeddingsArtifact ? { design_reference_embeddings: embeddingsArtifact } : {})
  };
  const updatedManifest: CaptureManifest = {
    ...manifest,
    run_artifacts: runArtifacts
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(updatedManifest, null, 2), "application/json");

  return { path: DESIGN_REFERENCES_RELATIVE_PATH, count: references.length, references };
}
