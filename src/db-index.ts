import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Queryable } from "./db.js";
import { getPool, runMigrations } from "./db.js";
import { upsertEmbeddings, type EmbeddingSubject } from "./embeddings.js";
import type { LlmDesignAnalysis } from "./llm-design.js";
import type { OntologyEntity, ViewportOntology } from "./ontology.js";
import type { RecipeStep, SectionCompositionDocument } from "./section-composition.js";
import type { ArtifactReference, CaptureManifest } from "./types.js";

export type Box = { x: number; y: number; width: number; height: number };

function allArtifacts(manifest: CaptureManifest): ArtifactReference[] {
  return [
    ...Object.values(manifest.run_artifacts),
    ...manifest.viewport_captures.flatMap((viewport) => Object.values(viewport.artifacts))
  ];
}

/** Union of role boxes in a recipe, used as section hotspot root. */
export function deriveRootBox(recipe: RecipeStep[]): Box | null {
  const boxes = recipe
    .filter((step): step is Extract<RecipeStep, { kind: "role" }> => step.kind === "role")
    .map((step) => step.box)
    .filter((box) => box && Number.isFinite(box.width) && Number.isFinite(box.height));
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

function textPreviewFromEntity(entity: OntologyEntity): string | null {
  const attrText =
    typeof entity.attributes.text === "string"
      ? entity.attributes.text
      : typeof entity.attributes.name === "string"
        ? entity.attributes.name
        : null;
  if (attrText && attrText.trim()) return attrText.trim().slice(0, 240);
  const evidenceText = entity.evidence.find((item) => typeof item.value === "string");
  if (evidenceText && typeof evidenceText.value === "string") return evidenceText.value.slice(0, 240);
  return null;
}

function boxFromEntity(entity: OntologyEntity): Box | null {
  const attrBox = entity.attributes.box ?? entity.attributes.bbox;
  if (attrBox && typeof attrBox === "object" && !Array.isArray(attrBox)) {
    const record = attrBox as Record<string, unknown>;
    const x = Number(record.x);
    const y = Number(record.y);
    const width = Number(record.width);
    const height = Number(record.height);
    if ([x, y, width, height].every(Number.isFinite)) return { x, y, width, height };
  }
  return null;
}

export async function indexCapturePackageToDatabase(
  packageRoot: string,
  client: Queryable | null = getPool()
): Promise<{ indexed: boolean; reason?: string }> {
  if (!client) return { indexed: false, reason: "database_unavailable" };
  await runMigrations(process.cwd(), client);

  const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8")) as CaptureManifest;
  const captureRunId = manifest.capture_run_id;
  const qualityOverall =
    typeof (manifest as { quality?: { overall?: number } }).quality?.overall === "number"
      ? (manifest as { quality?: { overall?: number } }).quality!.overall!
      : null;

  let qualityRating: string | null = null;
  let qualityScore = qualityOverall;
  try {
    const qualityPath = manifest.run_artifacts.quality?.path ?? "quality.json";
    const quality = JSON.parse(await readFile(resolve(packageRoot, qualityPath), "utf8")) as {
      overall?: number;
      rating?: string;
    };
    qualityScore = typeof quality.overall === "number" ? quality.overall : qualityScore;
    qualityRating = typeof quality.rating === "string" ? quality.rating : null;
  } catch {
    /* optional */
  }

  await client.query(
    `INSERT INTO captures (
      capture_run_id, package_path, requested_url, canonical_url, status,
      site_domain, page_route, quality_overall, quality_rating, started_at, completed_at, indexed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (capture_run_id) DO UPDATE SET
      package_path = EXCLUDED.package_path,
      status = EXCLUDED.status,
      quality_overall = EXCLUDED.quality_overall,
      quality_rating = EXCLUDED.quality_rating,
      completed_at = EXCLUDED.completed_at,
      indexed_at = NOW()`,
    [
      captureRunId,
      packageRoot,
      manifest.requested_url,
      manifest.canonical_url,
      manifest.status,
      manifest.site.domain,
      manifest.page.route,
      qualityScore,
      qualityRating,
      manifest.started_at,
      manifest.completed_at
    ]
  );

  await client.query("DELETE FROM viewports WHERE capture_run_id = $1", [captureRunId]);
  for (const viewport of manifest.viewport_captures) {
    await client.query(
      `INSERT INTO viewports (
        capture_run_id, viewport_capture_id, name, status, width, height, node_count, title,
        settled_screenshot_path, full_page_screenshot_path
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        captureRunId,
        viewport.viewport_capture_id,
        viewport.name,
        viewport.status,
        viewport.viewport.width,
        viewport.viewport.height,
        viewport.node_count,
        viewport.title,
        viewport.artifacts.viewport_screenshot?.path ?? null,
        viewport.artifacts.full_page_screenshot?.path ?? null
      ]
    );
  }

  const viewportSizeByCaptureId = new Map(
    manifest.viewport_captures.map((viewport) => [
      viewport.viewport_capture_id,
      { width: viewport.viewport.width, height: viewport.viewport.height }
    ])
  );

  const embeddingSubjects: EmbeddingSubject[] = [];

  await client.query("DELETE FROM sections WHERE capture_run_id = $1", [captureRunId]);
  try {
    const sectionPath = manifest.run_artifacts.section_compositions?.path ?? "derived/section-compositions.json";
    const sectionDoc = JSON.parse(await readFile(resolve(packageRoot, sectionPath), "utf8")) as SectionCompositionDocument;
    for (const viewport of sectionDoc.viewports ?? []) {
      const namedSize =
        viewportSizeByCaptureId.get(viewport.viewport_capture_id) ??
        (() => {
          const match = manifest.viewport_captures.find((v) => v.name === viewport.viewport_name);
          return match ? { width: match.viewport.width, height: match.viewport.height } : null;
        })();
      for (const section of viewport.sections ?? []) {
        const rootBox = deriveRootBox(section.recipe ?? []);
        await client.query(
          `INSERT INTO sections (
            capture_run_id, viewport_capture_id, viewport_name, section_id, root_node_id,
            taxonomy_id, category, signature, confidence, method, recipe, text_signals,
            root_box, viewport_width, viewport_height
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15)`,
          [
            captureRunId,
            section.viewport_capture_id,
            section.viewport_name,
            section.section_id,
            section.root_node_id,
            section.taxonomy_id,
            section.category,
            section.signature,
            section.confidence,
            section.method,
            JSON.stringify(section.recipe),
            JSON.stringify(section.text_signals),
            rootBox ? JSON.stringify(rootBox) : null,
            namedSize?.width ?? null,
            namedSize?.height ?? null
          ]
        );
        embeddingSubjects.push({
          subject_kind: "section",
          subject_id: section.section_id,
          content_text: [section.category, section.signature, section.taxonomy_id, ...(section.text_signals ?? [])]
            .filter(Boolean)
            .join(" ")
        });
      }
    }
  } catch {
    /* section compositions optional for older packages */
  }

  await client.query("DELETE FROM llm_items WHERE capture_run_id = $1", [captureRunId]);
  await client.query("DELETE FROM llm_analyses WHERE capture_run_id = $1", [captureRunId]);
  try {
    const llmPath = manifest.run_artifacts.llm_design?.path ?? "derived/llm-design.json";
    const llm = JSON.parse(await readFile(resolve(packageRoot, llmPath), "utf8")) as LlmDesignAnalysis;
    await client.query(
      `INSERT INTO llm_analyses (
        capture_run_id, model, base_url, status, analysis_mode, design_summary,
        hypothesis_count, raw_response_sha256, generated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        captureRunId,
        llm.model,
        llm.base_url,
        llm.status,
        llm.analysis_mode ?? null,
        llm.design_summary,
        llm.hypotheses?.length ?? 0,
        llm.raw_response_sha256 ?? null,
        llm.generated_at
      ]
    );
    if (llm.design_summary?.trim()) {
      embeddingSubjects.push({
        subject_kind: "capture_summary",
        subject_id: captureRunId,
        content_text: llm.design_summary
      });
    }
    let llmItemIndex = 0;
    for (const pattern of llm.mobbin?.screen_patterns ?? []) {
      llmItemIndex += 1;
      await client.query(
        `INSERT INTO llm_items (capture_run_id, kind, name, confidence, evidence_refs)
         VALUES ($1,'screen_pattern',$2,$3,$4::jsonb)`,
        [captureRunId, pattern.name, pattern.confidence, JSON.stringify(pattern.evidence_refs)]
      );
      embeddingSubjects.push({
        subject_kind: "llm_item",
        subject_id: `screen_pattern:${llmItemIndex}:${pattern.name}`,
        content_text: `screen_pattern ${pattern.name}`
      });
    }
    for (const element of llm.mobbin?.ui_elements ?? []) {
      llmItemIndex += 1;
      await client.query(
        `INSERT INTO llm_items (capture_run_id, kind, name, confidence, evidence_refs)
         VALUES ($1,'ui_element',$2,$3,$4::jsonb)`,
        [captureRunId, element.name, element.confidence, JSON.stringify(element.evidence_refs)]
      );
      embeddingSubjects.push({
        subject_kind: "llm_item",
        subject_id: `ui_element:${llmItemIndex}:${element.name}`,
        content_text: `ui_element ${element.name}`
      });
    }
    for (const insight of llm.mobbin?.recipe_insights ?? []) {
      llmItemIndex += 1;
      await client.query(
        `INSERT INTO llm_items (capture_run_id, kind, name, signature, category, interpretation, confidence, evidence_refs, gaps)
         VALUES ($1,'recipe_insight',$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [
          captureRunId,
          insight.signature,
          insight.signature,
          insight.category ?? null,
          insight.interpretation,
          0.7,
          JSON.stringify(insight.evidence_refs),
          JSON.stringify(insight.gaps ?? [])
        ]
      );
      embeddingSubjects.push({
        subject_kind: "llm_item",
        subject_id: `recipe_insight:${llmItemIndex}:${insight.signature}`,
        content_text: `recipe ${insight.category ?? ""} ${insight.signature} ${insight.interpretation}`
      });
    }
    for (const step of llm.mobbin?.page_flow ?? []) {
      llmItemIndex += 1;
      await client.query(
        `INSERT INTO llm_items (capture_run_id, kind, section_label, signature, step_index, evidence_refs)
         VALUES ($1,'page_flow',$2,$3,$4,'[]'::jsonb)`,
        [captureRunId, step.section_label, step.signature ?? null, step.step]
      );
      embeddingSubjects.push({
        subject_kind: "llm_item",
        subject_id: `page_flow:${llmItemIndex}:${step.step}`,
        content_text: `page_flow ${step.section_label} ${step.signature ?? ""}`
      });
    }
  } catch {
    /* llm optional */
  }

  await client.query("DELETE FROM design_nodes WHERE capture_run_id = $1", [captureRunId]);
  try {
    const ontologyPath = manifest.run_artifacts.ontology?.path ?? "derived/ontology.json";
    const ontologyDoc = JSON.parse(await readFile(resolve(packageRoot, ontologyPath), "utf8")) as {
      viewports?: ViewportOntology[];
    } | ViewportOntology[];
    const viewports = Array.isArray(ontologyDoc)
      ? ontologyDoc
      : Array.isArray(ontologyDoc.viewports)
        ? ontologyDoc.viewports
        : [];
    for (const viewport of viewports) {
      for (const entity of viewport.entities ?? []) {
        const preview = textPreviewFromEntity(entity);
        const box = boxFromEntity(entity);
        await client.query(
          `INSERT INTO design_nodes (
            capture_run_id, viewport_capture_id, ontology_entity_id, node_id,
            taxonomy_id, label, entity_type, text_preview, confidence, box
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
          ON CONFLICT (capture_run_id, ontology_entity_id) DO UPDATE SET
            label = EXCLUDED.label,
            text_preview = EXCLUDED.text_preview,
            confidence = EXCLUDED.confidence,
            box = EXCLUDED.box`,
          [
            captureRunId,
            viewport.viewport_capture_id,
            entity.ontology_entity_id,
            entity.source_node_id,
            entity.taxonomy_id,
            entity.label,
            entity.entity_type,
            preview,
            entity.confidence,
            box ? JSON.stringify(box) : null
          ]
        );
        embeddingSubjects.push({
          subject_kind: "design_node",
          subject_id: entity.ontology_entity_id,
          content_text: [entity.label, entity.taxonomy_id, entity.entity_type, preview].filter(Boolean).join(" ")
        });
      }
    }
  } catch {
    /* ontology optional */
  }

  await client.query("DELETE FROM artifacts WHERE capture_run_id = $1", [captureRunId]);
  for (const artifact of allArtifacts(manifest)) {
    await client.query(
      `INSERT INTO artifacts (capture_run_id, path, sha256, bytes, media_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (capture_run_id, path) DO UPDATE SET
         sha256 = EXCLUDED.sha256, bytes = EXCLUDED.bytes, media_type = EXCLUDED.media_type`,
      [captureRunId, artifact.path, artifact.sha256, artifact.bytes, artifact.media_type]
    );
  }

  try {
    await upsertEmbeddings(client, captureRunId, embeddingSubjects);
  } catch {
    /* vector extension may be unavailable until migrate/image switch */
  }

  return { indexed: true };
}
