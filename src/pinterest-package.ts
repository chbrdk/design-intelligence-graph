import sharp from "sharp";
import { resolve } from "node:path";
import { CANONICAL_VIEWPORTS, VERSION } from "./config.js";
import { createId, ensureDirectory, safeDirectoryName, writeArtifact, writeJsonLinesArtifact } from "./io.js";
import { createPageIdentity, createSiteIdentity } from "./identity.js";
import { matchLogicalElements, type MatchableNode, type ViewportNodeSet } from "./matching.js";
import {
  deriveResponsiveTransformations,
  type MeasuredBox,
  type MeasuredStyle,
  type ResponsiveViewportEvidence
} from "./responsive.js";
import { analyzeViewportLayout } from "./layout-analysis.js";
import { deriveResponsiveLayoutGraph, deriveViewportGeometryLayout, GEOMETRY_MODEL_VERSION } from "./geometry-model.js";
import {
  attachLogicalElements,
  deriveViewportOntology,
  enrichOntologyWithSectionCompositions,
  uniquifyOntologyViewports
} from "./ontology.js";
import { ONTOLOGY_VERSION, TAXONOMY } from "./taxonomy.js";
import { deriveSectionCompositionsDocument } from "./section-composition.js";
import { emitSectionCrops } from "./section-crops.js";
import {
  deriveVisualHypotheses,
  deriveVisualLanguageViewport,
  VISUAL_LANGUAGE_VERSION,
  type VisualViewportEvidence
} from "./visual-language.js";
import { summarizeMotion } from "./motion.js";
import { analyzeColorUsage } from "./color-analysis.js";
import { aggregateQuality, evaluateQuality } from "./quality.js";
import { deriveAnalysisReport } from "./analysis-pipeline.js";
import { emitDesignTokensForPackage } from "./design-tokens.js";
import { emitStructureSpineForPackage } from "./structure-spine.js";
import { screenshotSettings } from "./screenshot-settings.js";
import { pinterestConfig } from "./runtime-paths.js";
import { pinPageUrl, type PinterestPin } from "./pinterest-client.js";
import type { CaptureManifest, ViewportResult } from "./types.js";

export type PinterestPackageInput = {
  pin: PinterestPin;
  image: Buffer;
  outputDirectory: string;
  boardId?: string;
  canonicalUrl?: string;
  intervention?: string;
  browserVersion?: string;
  userAgent?: string;
  experiment?: string;
};

function desktopViewport() {
  return CANONICAL_VIEWPORTS.find((item) => item.name === pinterestConfig().viewportName) ?? CANONICAL_VIEWPORTS[CANONICAL_VIEWPORTS.length - 1]!;
}

export async function ingestPinterestPinPackage(
  input: PinterestPackageInput
): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
  const viewport = desktopViewport();
  const pinUrl = input.canonicalUrl ?? pinPageUrl(input.pin.id);
  const intervention = input.intervention ?? "pinterest_oauth_board_import";
  const startedAt = new Date().toISOString();
  const runId = createId("cap");
  const packageRoot = resolve(
    input.outputDirectory,
    `${safeDirectoryName(new URL(pinUrl))}_${startedAt.replace(/[:.]/g, "-").slice(0, 19)}_${runId.slice(-8)}`
  );
  await ensureDirectory(packageRoot);

  const decoded = sharp(input.image);
  const meta = await decoded.metadata();
  const sourceWidth = Math.max(1, meta.width ?? 1);
  const sourceHeight = Math.max(1, meta.height ?? 1);
  const documentWidth = viewport.width;
  const documentHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * documentWidth));
  const shot = screenshotSettings();
  const fullPage = await sharp(input.image)
    .resize({ width: documentWidth, height: documentHeight, fit: "fill" })
    .toFormat(shot.format, shot.format === "webp" ? { quality: shot.quality } : undefined)
    .toBuffer();
  const settled = await sharp(fullPage)
    .extract({
      left: 0,
      top: 0,
      width: documentWidth,
      height: Math.min(viewport.height, documentHeight)
    })
    .toBuffer();

  const ids = { html: "n_html", body: "n_body", img: "n_img" };
  const title = input.pin.title || `Pinterest pin ${input.pin.id}`;
  const nodes: MatchableNode[] = [
    {
      node_id: ids.html,
      parent_node_id: null,
      node_type: "element",
      tag: "html",
      rendered: true,
      attributes: { lang: "en" }
    },
    {
      node_id: ids.body,
      parent_node_id: ids.html,
      node_type: "element",
      tag: "body",
      rendered: true,
      attributes: {}
    },
    {
      node_id: ids.img,
      parent_node_id: ids.body,
      node_type: "element",
      tag: "img",
      rendered: true,
      attributes: { alt: title, src: input.pin.image?.url ?? pinUrl }
    }
  ];
  const boxes: MeasuredBox[] = [
    { node_id: ids.html, bbox: { x: 0, y: 0, width: documentWidth, height: documentHeight } },
    { node_id: ids.body, bbox: { x: 0, y: 0, width: documentWidth, height: documentHeight } },
    { node_id: ids.img, bbox: { x: 0, y: 0, width: documentWidth, height: documentHeight } }
  ];
  const styles: MeasuredStyle[] = [
    { node_id: ids.html, properties: { display: "block", width: `${documentWidth}px`, height: `${documentHeight}px` } },
    { node_id: ids.body, properties: { display: "block", margin: "0px", padding: "0px" } },
    {
      node_id: ids.img,
      properties: {
        display: "block",
        width: `${documentWidth}px`,
        height: `${documentHeight}px`,
        "object-fit": "cover"
      }
    }
  ];
  const prefix = `viewports/${viewport.name}`;
  const viewportCaptureId = createId("vpc");
  const quality = evaluateQuality({
    subsystem_success: 1,
    geometry_coverage: 1,
    style_coverage: 0.4,
    screenshot_completeness: 1,
    accessibility_coverage: 0.5,
    asset_completeness: 1,
    font_completeness: 0,
    network_completion: 1,
    state_restoration: 1,
    scroll_restoration: 1
  });

  const artifacts: ViewportResult["artifacts"] = {};
  const html = `<!doctype html><html lang="en"><body><img alt="${title.replace(/"/g, "")}" src="${input.pin.image?.url ?? ""}"></body></html>`;
  artifacts.source_html = await writeArtifact(packageRoot, `${prefix}/html/source.html`, html, "text/html; charset=utf-8");
  artifacts.rendered_html = await writeArtifact(packageRoot, `${prefix}/html/rendered.html`, html, "text/html; charset=utf-8");
  artifacts.nodes = await writeJsonLinesArtifact(packageRoot, `${prefix}/dom/nodes.jsonl`, nodes);
  artifacts.accessibility = await writeJsonLinesArtifact(packageRoot, `${prefix}/dom/accessibility.jsonl`, [
    { dom_node_id: ids.img, role: "img", name: title }
  ]);
  artifacts.computed_styles = await writeJsonLinesArtifact(packageRoot, `${prefix}/styles/computed.jsonl`, styles);
  artifacts.colors = await writeArtifact(
    packageRoot,
    `${prefix}/styles/colors.json`,
    JSON.stringify({
      schema_version: "0.1.0",
      color_space: "srgb",
      layer: "L2",
      colors: analyzeColorUsage(styles),
      provenance: { layer: "L2", method: "computed_color_normalization", confidence: 1 }
    }, null, 2),
    "application/json"
  );
  artifacts.motion = await writeArtifact(packageRoot, `${prefix}/motion/motions.json`, JSON.stringify([], null, 2), "application/json");
  artifacts.motion_summary = await writeArtifact(
    packageRoot,
    `${prefix}/motion/summary.json`,
    JSON.stringify({
      schema_version: "0.1.0",
      layer: "L2",
      ...summarizeMotion([]),
      provenance: { layer: "L2", method: "deterministic_motion_summary", confidence: 1 }
    }, null, 2),
    "application/json"
  );
  artifacts.geometry = await writeJsonLinesArtifact(packageRoot, `${prefix}/geometry/boxes.jsonl`, boxes);
  artifacts.text_lines = await writeJsonLinesArtifact(packageRoot, `${prefix}/geometry/text-lines.jsonl`, [
    { node_id: ids.img, text: title, box: boxes[2]!.bbox }
  ]);
  artifacts.assets = await writeArtifact(
    packageRoot,
    `${prefix}/assets/metadata.json`,
    JSON.stringify([{ type: "image", node_id: ids.img, intrinsic: { width: sourceWidth, height: sourceHeight } }], null, 2),
    "application/json"
  );
  artifacts.viewport_screenshot = await writeArtifact(
    packageRoot,
    `${prefix}/screenshots/settled${shot.extension}`,
    settled,
    shot.mediaType
  );
  artifacts.full_page_screenshot = await writeArtifact(
    packageRoot,
    `${prefix}/screenshots/full-page${shot.extension}`,
    fullPage,
    shot.mediaType
  );
  artifacts.playwright_full_page_screenshot = artifacts.full_page_screenshot;

  const viewportResult: ViewportResult = {
    viewport_capture_id: viewportCaptureId,
    name: viewport.name,
    viewport: { width: viewport.width, height: viewport.height, device_scale_factor: viewport.deviceScaleFactor },
    document: { width: documentWidth, height: documentHeight },
    final_url: pinUrl,
    title,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: "complete",
    node_count: nodes.length,
    visible_node_count: nodes.length,
    text_line_count: 1,
    artifacts,
    warnings: [intervention],
    quality
  };

  const viewportNodeSets: ViewportNodeSet[] = [
    { viewport_capture_id: viewportCaptureId, viewport_name: viewport.name, nodes }
  ];
  const logicalElements = matchLogicalElements(viewportNodeSets);
  const evidence: ResponsiveViewportEvidence = {
    viewport_capture_id: viewportCaptureId,
    viewport_name: viewport.name,
    width: viewport.width,
    height: viewport.height,
    documentWidth,
    documentHeight,
    nodes,
    boxes,
    styles
  };
  const visualEvidence: VisualViewportEvidence = {
    viewport_capture_id: viewportCaptureId,
    viewport_name: viewport.name,
    document_width: documentWidth,
    document_height: documentHeight,
    visible_node_count: nodes.length,
    styles,
    boxes,
    assets: [{ type: "image", node_id: ids.img, intrinsic: { width: sourceWidth, height: sourceHeight } }],
    fonts: [],
    motion: []
  };

  const runArtifacts: CaptureManifest["run_artifacts"] = {};
  runArtifacts.logical_elements = await writeArtifact(
    packageRoot,
    "derived/logical-elements.json",
    JSON.stringify({
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      layer: "L2",
      logical_element_count: logicalElements.length,
      logical_elements: logicalElements
    }, null, 2),
    "application/json"
  );
  const responsiveTransformations = deriveResponsiveTransformations(logicalElements, [evidence]);
  runArtifacts.responsive_transformations = await writeArtifact(
    packageRoot,
    "derived/responsive-transformations.json",
    JSON.stringify({
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      layer: "L2",
      comparison_strategy: "adjacent_viewports_by_width",
      transformation_count: responsiveTransformations.length,
      transformations: responsiveTransformations
    }, null, 2),
    "application/json"
  );
  runArtifacts.layout_analysis = await writeArtifact(
    packageRoot,
    "derived/layout-analysis.json",
    JSON.stringify({
      schema_version: "0.1.0",
      layer: "L2",
      viewports: [analyzeViewportLayout({ viewport_capture_id: viewportCaptureId, viewport_name: viewport.name, nodes, boxes })]
    }, null, 2),
    "application/json"
  );
  const geometryLayouts = [deriveViewportGeometryLayout(evidence)];
  runArtifacts.geometry_layout = await writeArtifact(
    packageRoot,
    "derived/geometry-layout.json",
    JSON.stringify({
      schema_version: "0.1.0",
      geometry_model_version: GEOMETRY_MODEL_VERSION,
      generated_at: new Date().toISOString(),
      layer: "L2",
      viewports: geometryLayouts
    }, null, 2),
    "application/json"
  );
  runArtifacts.responsive_layout_graph = await writeArtifact(
    packageRoot,
    "derived/responsive-layout-graph.json",
    JSON.stringify(deriveResponsiveLayoutGraph(logicalElements, responsiveTransformations), null, 2),
    "application/json"
  );
  const visualLanguageViewports = [deriveVisualLanguageViewport(visualEvidence)];
  const visualHypotheses = deriveVisualHypotheses(visualLanguageViewports);
  runArtifacts.visual_language = await writeArtifact(
    packageRoot,
    "derived/visual-language.json",
    JSON.stringify({
      schema_version: "0.1.0",
      visual_language_version: VISUAL_LANGUAGE_VERSION,
      generated_at: new Date().toISOString(),
      viewports: visualLanguageViewports,
      hypotheses: visualHypotheses
    }, null, 2),
    "application/json"
  );
  try {
    const tokenEmit = await emitDesignTokensForPackage(packageRoot, visualLanguageViewports);
    if (tokenEmit) runArtifacts.design_tokens = tokenEmit.artifact;
  } catch {
    /* optional */
  }
  const viewportOntologies = attachLogicalElements(
    [
      deriveViewportOntology({
        viewport_capture_id: viewportCaptureId,
        viewport_name: viewport.name,
        viewport_height: viewport.height,
        title,
        nodes,
        boxes,
        styles
      })
    ],
    logicalElements
  );
  const sectionCompositionDoc = deriveSectionCompositionsDocument([
    {
      viewport_capture_id: viewportCaptureId,
      viewport_name: viewport.name,
      viewport_height: viewport.height,
      nodes,
      boxes,
      styles
    }
  ]);
  const enrichedOntologies = enrichOntologyWithSectionCompositions(
    viewportOntologies,
    sectionCompositionDoc.viewports.flatMap((item) => item.sections)
  );
  runArtifacts.section_compositions = await writeArtifact(
    packageRoot,
    "derived/section-compositions.json",
    JSON.stringify(sectionCompositionDoc, null, 2),
    "application/json"
  );
  try {
    const spineEmit = await emitStructureSpineForPackage(packageRoot, sectionCompositionDoc, {
      viewportHeights: { [viewport.name]: viewport.height }
    });
    if (spineEmit) runArtifacts.structure_spine = spineEmit.artifact;
  } catch {
    /* optional */
  }
  try {
    const cropEmit = await emitSectionCrops({
      packageRoot,
      viewportCaptures: [viewportResult],
      sections: sectionCompositionDoc.viewports.flatMap((item) => item.sections),
      viewportName: viewport.name
    });
    runArtifacts.section_crops = cropEmit.artifact;
  } catch {
    /* optional */
  }
  const ontologyViewports = uniquifyOntologyViewports(enrichedOntologies);
  runArtifacts.ontology_catalog = await writeArtifact(
    packageRoot,
    "ontology/catalog.json",
    JSON.stringify({ ontology_version: ONTOLOGY_VERSION, terms: TAXONOMY }, null, 2),
    "application/json"
  );
  runArtifacts.ontology = await writeArtifact(
    packageRoot,
    "derived/ontology.json",
    JSON.stringify({
      schema_version: "0.1.0",
      ontology_version: ONTOLOGY_VERSION,
      generated_at: new Date().toISOString(),
      viewports: ontologyViewports
    }, null, 2),
    "application/json"
  );
  runArtifacts.quality = await writeArtifact(
    packageRoot,
    "quality.json",
    JSON.stringify({ ...quality, viewport_completeness: "1/1", viewports: [viewportResult] }, null, 2),
    "application/json"
  );
  runArtifacts.analysis = await writeArtifact(
    packageRoot,
    "derived/analysis-report.json",
    JSON.stringify(
      deriveAnalysisReport({
        logical_elements: logicalElements,
        transformations: responsiveTransformations,
        geometry_layouts: geometryLayouts,
        ontologies: ontologyViewports,
        visual_language: visualLanguageViewports,
        visual_hypotheses: visualHypotheses,
        quality
      }),
      null,
      2
    ),
    "application/json"
  );

  const site = createSiteIdentity(pinUrl);
  const pageIdentity = createPageIdentity(pinUrl, site.site_id);
  const manifest: CaptureManifest = {
    schema_version: "0.1.0",
    capture_run_id: runId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    requested_url: pinUrl,
    canonical_url: pinUrl,
    site,
    page: pageIdentity,
    crawler: { name: "dig-capture", version: VERSION },
    browser: {
      engine: "chromium",
      version: input.browserVersion ?? "pinterest-ingest",
      user_agent: input.userAgent ?? "spirion-pinterest-ingest",
      locale: "en-US",
      timezone: "UTC"
    },
    environment: {
      prefers_color_scheme: "light",
      prefers_reduced_motion: false,
      forced_colors: false,
      touch: false,
      pointer: "fine",
      hover: true
    },
    capture_dimensions: {
      locale: "en-US",
      market: "unknown",
      theme: "light",
      consent_state: "unknown",
      authentication_state: "unauthenticated",
      personalization: "unknown",
      experiments: [
        input.experiment ?? `pinterest_board:${input.boardId ?? input.pin.board_id ?? "unknown"}`
      ]
    },
    policy: {
      authorization_basis: "user_initiated_public_capture",
      robots_decision: "not_evaluated_interactive_capture",
      retention_class: "unspecified",
      redistribution_class: "structural_evidence_only"
    },
    status: "complete",
    capture_status: { dom: "complete", css: "complete", visual: "complete", assets: "complete", accessibility: "complete", interaction: "unsupported" },
    run_artifacts: runArtifacts,
    viewport_captures: [viewportResult],
    interventions: [intervention],
    errors: []
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(manifest, null, 2), "application/json");
  return { packageRoot, manifest };
}
