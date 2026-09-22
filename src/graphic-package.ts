/**
 * Dedicated SPIRION graphic / campaign / print artboard package.
 * Not a web capture: native artboard dimensions, composition_contract SSOT, no page_rhythm.
 */
import { resolve } from "node:path";
import sharp from "sharp";
import { VERSION } from "./config.js";
import {
  enrichGraphicFromImage,
  type CompositionContract
} from "./composition-contract.js";
import { createId, ensureDirectory, writeArtifact } from "./io.js";
import { createPageIdentity, createSiteIdentity } from "./identity.js";
import { screenshotSettings } from "./screenshot-settings.js";
import { uploadedImageUrl } from "./runtime-paths.js";
import {
  isGraphicAssetKind,
  normalizeAssetKind,
  type SpirionAssetKind
} from "./spirion-asset.js";
import type { CaptureManifest, ViewportResult } from "./types.js";
import { evaluateQuality, ZERO_QUALITY_METRICS } from "./quality.js";

export const GRAPHIC_INGEST_INTERVENTION_PREFIX = "graphic_asset_ingest" as const;

export type GraphicPackageInput = {
  image: Buffer;
  outputDirectory: string;
  sourceId: string;
  filename: string;
  assetKind: SpirionAssetKind;
  canonicalUrl?: string;
};

export function graphicIngestIntervention(kind: SpirionAssetKind): string {
  return `${GRAPHIC_INGEST_INTERVENTION_PREFIX}:${kind}`;
}

export function isGraphicIngestPackage(manifest: Pick<CaptureManifest, "interventions">): boolean {
  return (manifest.interventions ?? []).some((item) =>
    item.startsWith(`${GRAPHIC_INGEST_INTERVENTION_PREFIX}:`)
  );
}

export function kindCompositionDefaults(kind: SpirionAssetKind): Partial<CompositionContract> {
  switch (kind) {
    case "print_ad":
      return {
        hierarchy: ["brand", "claim", "support", "legal"],
        ctaRole: "absent",
        marginBleed: { safeRel: 0.08, bleedRel: 0.03, quietZoneRel: 0.1 },
        avoid: [
          "equal-three-icon-row",
          "tiny-legal-collision",
          "web hero scroll bands",
          "omit bleed/safe quiet zone",
          "screen nav chrome on print artboard"
        ]
      };
    case "social_post":
      return {
        hierarchy: ["claim", "brand", "support"],
        ctaRole: "absent",
        marginBleed: { safeRel: 0.06, bleedRel: 0, quietZoneRel: 0.08 },
        avoid: [
          "busy-center",
          "tiny-legal-collision",
          "desktop landing section stack",
          "equal-three-icon-row"
        ]
      };
    case "campaign_keyvisual":
      return {
        hierarchy: ["brand", "claim", "support"],
        ctaRole: "absent",
        focal: "claim",
        marginBleed: { safeRel: 0.07, bleedRel: 0.02, quietZoneRel: 0.1 },
        avoid: [
          "fake web hero scroll bands",
          "equal-three-icon-row",
          "busy-center",
          "card-kit landing as key visual"
        ]
      };
    case "brand_system":
      return {
        hierarchy: ["brand", "support", "legal"],
        layoutFamily: "centered-lockup",
        ctaRole: "absent",
        avoid: ["invent foreign brand marks", "web CTA rows", "equal-three-icon-row"]
      };
    case "moodboard":
      return {
        hierarchy: ["support"],
        ctaRole: "absent",
        avoid: ["treat moodboard as craft SSOT", "copy collage 1:1 into deliverable"]
      };
    default:
      return {
        hierarchy: ["claim", "support"],
        ctaRole: "absent",
        avoid: ["web page_rhythm bands", "equal-three-icon-row", "busy-center"]
      };
  }
}

export async function ingestGraphicAssetPackage(
  input: GraphicPackageInput
): Promise<{ packageRoot: string; manifest: CaptureManifest; composition: CompositionContract }> {
  const kind = normalizeAssetKind(input.assetKind, "other_graphic");
  if (!isGraphicAssetKind(kind)) {
    throw new Error(`graphic_ingest_requires_graphic_kind:${kind}`);
  }

  const startedAt = new Date().toISOString();
  const runId = createId("cap");
  const canonicalUrl = input.canonicalUrl ?? uploadedImageUrl(input.sourceId);
  const packageRoot = resolve(
    input.outputDirectory,
    `graphic_${kind}_${startedAt.replace(/[:.]/g, "-").slice(0, 19)}_${runId.slice(-8)}`
  );
  await ensureDirectory(packageRoot);

  const enriched = await enrichGraphicFromImage(input.image);
  const defaults = kindCompositionDefaults(kind);
  const composition: CompositionContract = {
    ...enriched.composition_contract,
    ...defaults,
    hierarchy: defaults.hierarchy ?? enriched.composition_contract.hierarchy,
    avoid: [...new Set([...(defaults.avoid ?? []), ...enriched.composition_contract.avoid])],
    marginBleed: {
      ...enriched.composition_contract.marginBleed,
      ...(defaults.marginBleed ?? {})
    },
    focal: defaults.focal ?? enriched.composition_contract.focal,
    layoutFamily: defaults.layoutFamily ?? enriched.composition_contract.layoutFamily,
    ctaRole: defaults.ctaRole ?? enriched.composition_contract.ctaRole
  };

  const width = Math.max(1, enriched.format.widthPx ?? 1);
  const height = Math.max(1, enriched.format.heightPx ?? 1);
  const shot = screenshotSettings();
  const artboard = await sharp(input.image, { failOn: "none" })
    .rotate()
    .toFormat(shot.format, shot.format === "webp" ? { quality: shot.quality } : undefined)
    .toBuffer();

  const prefix = "viewports/artboard";
  const viewportCaptureId = createId("vpc");
  const ids = { html: "n_html", body: "n_body", img: "n_img" };

  const nodes = [
    {
      node_id: ids.html,
      parent_node_id: null,
      node_type: "element",
      tag: "html",
      rendered: true,
      attributes: { lang: "en", "data-spirion-pipeline": "graphic" }
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
      attributes: { alt: input.filename, role: "artboard" }
    }
  ];
  const boxes = [
    { node_id: ids.html, x: 0, y: 0, width, height },
    { node_id: ids.body, x: 0, y: 0, width, height },
    { node_id: ids.img, x: 0, y: 0, width, height }
  ];
  const styles = [
    {
      node_id: ids.body,
      properties: { backgroundColor: composition.colorAxes.ground ?? "#000000" }
    },
    {
      node_id: ids.img,
      properties: { objectFit: "cover", width: `${width}px`, height: `${height}px` }
    }
  ];

  const runArtifacts: CaptureManifest["run_artifacts"] = {};
  runArtifacts.composition_contract = await writeArtifact(
    packageRoot,
    "derived/composition-contract.json",
    `${JSON.stringify(composition, null, 2)}\n`,
    "application/json"
  );

  const assetMeta = {
    schema_version: "0.1.0",
    pipeline: "graphic",
    asset_kind: kind,
    source: "upload",
    source_id: input.sourceId,
    filename: input.filename,
    format: enriched.format,
    tags: [...enriched.tags, `kind:${kind}`, "pipeline:graphic"],
    content_hash: enriched.content_hash,
    thin: enriched.thin
  };
  runArtifacts.spirion_asset = await writeArtifact(
    packageRoot,
    "derived/spirion-asset.json",
    `${JSON.stringify(assetMeta, null, 2)}\n`,
    "application/json"
  );

  const nodesArt = await writeArtifact(
    packageRoot,
    `${prefix}/nodes.jsonl`,
    `${nodes.map((n) => JSON.stringify(n)).join("\n")}\n`,
    "application/x-ndjson"
  );
  const boxesArt = await writeArtifact(
    packageRoot,
    `${prefix}/boxes.jsonl`,
    `${boxes.map((b) => JSON.stringify(b)).join("\n")}\n`,
    "application/x-ndjson"
  );
  const stylesArt = await writeArtifact(
    packageRoot,
    `${prefix}/styles.jsonl`,
    `${styles.map((s) => JSON.stringify(s)).join("\n")}\n`,
    "application/x-ndjson"
  );
  const screenshot = await writeArtifact(
    packageRoot,
    `${prefix}/artboard.${shot.format === "webp" ? "webp" : "png"}`,
    artboard,
    shot.format === "webp" ? "image/webp" : "image/png"
  );

  const quality = evaluateQuality({
    ...ZERO_QUALITY_METRICS,
    subsystem_success: 1,
    geometry_coverage: 1,
    style_coverage: 0.5,
    screenshot_completeness: 1,
    asset_completeness: 1,
    network_completion: 1
  });

  const viewportResult: ViewportResult = {
    viewport_capture_id: viewportCaptureId,
    name: "artboard",
    viewport: { width, height, device_scale_factor: 1 },
    document: { width, height },
    final_url: canonicalUrl,
    title: input.filename,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: "complete",
    node_count: nodes.length,
    visible_node_count: nodes.length,
    text_line_count: 0,
    artifacts: {
      nodes: nodesArt,
      boxes: boxesArt,
      styles: stylesArt,
      viewport_screenshot: screenshot,
      full_page_screenshot: screenshot
    },
    warnings: [],
    quality
  };

  const logical = {
    schema_version: "0.1.0",
    logical_element_count: 1,
    logical_elements: [
      {
        logical_element_id: "le_artboard",
        members: [{ viewport_capture_id: viewportCaptureId, node_id: ids.img }],
        match_confidence: 1,
        match_method: "graphic_artboard"
      }
    ]
  };
  runArtifacts.logical_elements = await writeArtifact(
    packageRoot,
    "derived/logical-elements.json",
    JSON.stringify(logical, null, 2),
    "application/json"
  );

  const ontology = {
    schema_version: "0.1.0",
    viewports: [
      {
        viewport_capture_id: viewportCaptureId,
        entities: [
          {
            ontology_entity_id: "oe_artboard",
            taxonomy_id: `spirion.graphic.${kind}`,
            label: kind,
            parent_entity_id: null,
            logical_element_id: "le_artboard",
            confidence: 1,
            layer: "graphic",
            method: "graphic_ingest"
          }
        ],
        relationships: []
      }
    ]
  };
  runArtifacts.ontology = await writeArtifact(
    packageRoot,
    "derived/ontology.json",
    JSON.stringify(ontology, null, 2),
    "application/json"
  );

  const analysis = {
    schema_version: "0.1.0",
    findings: [
      {
        finding_id: "gf_composition",
        kind: "composition_contract",
        value: 1,
        unit: "present",
        confidence: enriched.thin ? 0.2 : 0.85,
        method: "graphic_enrichment"
      }
    ],
    semantic_inputs: [
      {
        source: "composition_contract",
        source_id: kind,
        viewport_capture_id: viewportCaptureId,
        confidence: 0.85,
        method: "graphic_ingest"
      }
    ]
  };
  runArtifacts.analysis = await writeArtifact(
    packageRoot,
    "derived/analysis-report.json",
    JSON.stringify(analysis, null, 2),
    "application/json"
  );
  runArtifacts.quality = await writeArtifact(
    packageRoot,
    "quality.json",
    JSON.stringify({ ...quality, viewport_completeness: "1/1", viewports: [viewportResult] }, null, 2),
    "application/json"
  );

  // Minimal stubs so web-only run_artifact keys are absent (graphic verify skips relations).
  const site = createSiteIdentity(canonicalUrl);
  const pageIdentity = createPageIdentity(canonicalUrl, site.site_id);
  const intervention = graphicIngestIntervention(kind);
  const manifest: CaptureManifest = {
    schema_version: "0.1.0",
    capture_run_id: runId,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    requested_url: canonicalUrl,
    canonical_url: canonicalUrl,
    site,
    page: pageIdentity,
    crawler: { name: "dig-capture", version: VERSION },
    browser: {
      engine: "chromium",
      version: "graphic-ingest",
      user_agent: "spirion-graphic-ingest",
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
      experiments: [`graphic:${kind}`]
    },
    policy: {
      authorization_basis: "user_initiated_public_capture",
      robots_decision: "not_evaluated_interactive_capture",
      retention_class: "unspecified",
      redistribution_class: "structural_evidence_only"
    },
    status: "complete",
    capture_status: {
      dom: "complete",
      css: "complete",
      visual: "complete",
      assets: "complete",
      accessibility: "unsupported",
      interaction: "unsupported"
    },
    run_artifacts: runArtifacts,
    viewport_captures: [viewportResult],
    interventions: [intervention],
    errors: []
  };

  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(manifest, null, 2), "application/json");
  return { packageRoot, manifest, composition };
}
