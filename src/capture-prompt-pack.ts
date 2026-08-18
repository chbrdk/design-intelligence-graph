/**
 * Capture → DesignPromptPack (look_contract + page_rhythm). Shared by HTTP + MCP.
 */

import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import { buildDesignFacets } from "./design-facets.js";
import { loadDesignTokensDocument } from "./design-tokens.js";
import { asLookContract } from "./look-contract.js";
import { asPageRhythm, loadPageRhythmForPackage } from "./page-rhythm.js";
import { loadVisionLayoutDocument } from "./vision-layout.js";
import { loadVisionPageDocument } from "./vision-page.js";

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
    `SELECT package_path, platform_project_id FROM captures WHERE capture_run_id = $1 LIMIT 1`,
    [captureRunId]
  );
  const row = capture.rows[0] as { package_path?: string; platform_project_id?: string | null } | undefined;
  if (!row?.package_path) {
    const error = new Error("capture_not_found");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
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
  const look_contract = asLookContract(body.look_contract) ?? facets.look_contract;
  const page_rhythm =
    asPageRhythm(body.page_rhythm) ?? (await loadPageRhythmForPackage(row.package_path).catch(() => null));

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
      : `Rebuild this screen using look_contract. Cite ${references[0]!.reference_id}.`;
  const output_contract =
    body.output_contract === "prose_brief" || body.output_contract === "both"
      ? body.output_contract
      : "layout_hints_json";

  return assembleDesignPromptPack({
    brief,
    pack: {
      schema_version: "0.1.0",
      intent: brief,
      references,
      synthesis_mode: "look_conditioned",
      constraints: { forbid_source_copy: true }
    },
    output_contract,
    look_contract,
    page_rhythm,
    tokens,
    layout: facets.layout,
    style: facets.style,
    spacing_feel: visionPage?.spacing_feel ?? null,
    visual_craft: visionPage?.visual_craft ?? null
  });
}

export async function assemblePromptPackForCaptureRunFromPool(
  captureRunId: string,
  body: Record<string, unknown> = {}
) {
  return assemblePromptPackForCaptureRun(getPool(), captureRunId, body);
}
