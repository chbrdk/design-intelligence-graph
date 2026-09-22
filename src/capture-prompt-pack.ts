/**
 * Capture → DesignPromptPack (look_contract + page_rhythm + composition_contract).
 * Shared by HTTP + MCP. Welle 2: output_contract graphic|composition|auto.
 */

import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import { buildDesignFacets } from "./design-facets.js";
import { loadDesignTokensDocument } from "./design-tokens.js";
import { asLookContract } from "./look-contract.js";
import { asPageRhythm, loadPageRhythmForPackage } from "./page-rhythm.js";
import {
  asCompositionContract,
  loadCompositionContract
} from "./composition-contract.js";
import { loadVisionLayoutDocument } from "./vision-layout.js";
import { loadVisionPageDocument } from "./vision-page.js";
import {
  normalizeAssetKind,
  resolvePackOutputContract,
  wantsComposition,
  wantsLook,
  wantsRhythm,
  type SpirionAssetKind
} from "./spirion-asset.js";

export async function assemblePromptPackForCaptureRun(
  client: Queryable | null,
  captureRunId: string,
  body: Record<string, unknown> = {}
) {
  if (!client) {
    const error = new Error("database_unavailable");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  const { listDesignReferencesForCapture, indexDesignReferencesFromPackage } = await import(
    "./design-reference-library.js"
  );
  const { assembleDesignPromptPack, syntheticScreenReference } = await import("./design-prompt-pack.js");
  const capture = await client.query(
    `SELECT package_path, platform_project_id, asset_kind, composition_contract
     FROM captures WHERE capture_run_id = $1 LIMIT 1`,
    [captureRunId]
  );
  const row = capture.rows[0] as
    | {
        package_path?: string;
        platform_project_id?: string | null;
        asset_kind?: string | null;
        composition_contract?: unknown;
      }
    | undefined;
  if (!row?.package_path) {
    const error = new Error("capture_not_found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  const assetKind: SpirionAssetKind = normalizeAssetKind(row.asset_kind, "web_screen");
  const platformProjectId =
    typeof body.platformProjectId === "string"
      ? body.platformProjectId
      : typeof body.platform_project_id === "string"
        ? body.platform_project_id
        : row.platform_project_id ?? null;

  let references = await listDesignReferencesForCapture(
    captureRunId,
    { platformProjectId, limit: 8 },
    client
  );
  if (!references.length) {
    try {
      await indexDesignReferencesFromPackage(row.package_path, { platformProjectId }, client);
      references = await listDesignReferencesForCapture(
        captureRunId,
        { platformProjectId, limit: 8 },
        client
      );
    } catch {
      references = [];
    }
  }

  const tokens = await loadDesignTokensDocument(row.package_path).catch(() => null);
  const visionPage = await loadVisionPageDocument(row.package_path).catch(() => null);
  const visionLayout = await loadVisionLayoutDocument(row.package_path).catch(() => null);
  const facets = buildDesignFacets({
    vision_page: visionPage,
    bands: visionLayout?.bands ?? [],
    tokens
  });
  const packContract = resolvePackOutputContract(body.output_contract, assetKind);
  const look_contract = wantsLook(packContract)
    ? asLookContract(body.look_contract) ?? facets.look_contract
    : null;
  const page_rhythm = wantsRhythm(packContract)
    ? asPageRhythm(body.page_rhythm) ??
      (await loadPageRhythmForPackage(row.package_path).catch(() => null))
    : null;
  const composition_contract = wantsComposition(packContract)
    ? asCompositionContract(body.composition_contract) ??
      asCompositionContract(row.composition_contract) ??
      (await loadCompositionContract(row.package_path).catch(() => null))
    : asCompositionContract(body.composition_contract) ?? null;

  if (!references.length) {
    references = [
      syntheticScreenReference({
        captureRunId,
        visionPage,
        lookContract: look_contract,
        style: facets.style,
        layout: facets.layout
      })
    ];
  }

  const brief =
    typeof body.brief === "string" && body.brief.trim()
      ? body.brief.trim()
      : wantsComposition(packContract)
        ? `Rebuild this artboard using composition_contract. Cite ${references[0]!.reference_id}.`
        : `Rebuild this screen using look_contract. Cite ${references[0]!.reference_id}.`;

  return assembleDesignPromptPack({
    brief,
    pack: {
      schema_version: "0.1.0",
      intent: brief,
      references,
      synthesis_mode: "look_conditioned",
      constraints: { forbid_source_copy: true }
    },
    output_contract: packContract,
    look_contract,
    page_rhythm,
    composition_contract,
    tokens,
    layout: facets.layout,
    style: facets.style,
    spacing_feel: visionPage?.spacing_feel ?? null,
    visual_craft: visionPage?.visual_craft ?? null,
    asset_kind: assetKind
  });
}

export async function assemblePromptPackForCaptureRunFromPool(
  captureRunId: string,
  body: Record<string, unknown> = {}
) {
  return assemblePromptPackForCaptureRun(getPool(), captureRunId, body);
}
