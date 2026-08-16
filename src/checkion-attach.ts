/**
 * Attach CHECKION full-page JPEG as DIG package primary screen media.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureCheckionFullPage,
  checkionConfig,
  checkionPeerReadyReason,
  isCheckionConfigured,
  type CheckionConfig,
  type CheckionScreenshot
} from "./checkion-client.js";
import { writeArtifact } from "./io.js";
import type { CaptureManifest } from "./types.js";

export interface AttachCheckionResult {
  attached: boolean;
  skipped?: string;
  scanId?: string;
  projectId?: string;
  path?: string;
  width?: number | null;
  height?: number | null;
  bytes?: number;
}

const CHECKION_RELATIVE = "viewports/desktop/screenshots/checkion-full-page.jpg";

export async function applyCheckionScreenshotToPackage(
  packageRoot: string,
  shot: CheckionScreenshot & { projectId?: string },
  options: { replacePlaywrightFullPage?: boolean } = {}
): Promise<AttachCheckionResult> {
  const replace = options.replacePlaywrightFullPage !== false;
  const manifestPath = resolve(packageRoot, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as CaptureManifest;

  const artifact = await writeArtifact(packageRoot, CHECKION_RELATIVE, shot.bytes, "image/jpeg");

  const meta = {
    scan_id: shot.scanId,
    project_id: shot.projectId ?? null,
    content_type: shot.contentType,
    width: shot.width,
    height: shot.height,
    bytes: shot.bytes.byteLength,
    attached_at: new Date().toISOString(),
    source: "checkion-v3"
  };
  const metaArtifact = await writeArtifact(
    packageRoot,
    "checkion/screenshot.json",
    JSON.stringify(meta, null, 2),
    "application/json"
  );

  manifest.run_artifacts = {
    ...manifest.run_artifacts,
    checkion_screenshot: artifact,
    checkion_screenshot_meta: metaArtifact
  };

  const desktop =
    manifest.viewport_captures.find((v) => v.name === "desktop") ?? manifest.viewport_captures[0];
  if (desktop) {
    desktop.artifacts = {
      ...desktop.artifacts,
      checkion_full_page_screenshot: artifact
    };
    if (replace) {
      // Keep DIG Playwright full-page for section crops (CHECKION JPEG may still include CMP chrome).
      if (desktop.artifacts.full_page_screenshot && !desktop.artifacts.playwright_full_page_screenshot) {
        desktop.artifacts.playwright_full_page_screenshot = desktop.artifacts.full_page_screenshot;
      }
      desktop.artifacts.full_page_screenshot = artifact;
    }
    if (shot.width && shot.height) {
      desktop.document = { width: shot.width, height: shot.height };
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    attached: true,
    scanId: shot.scanId,
    ...(shot.projectId ? { projectId: shot.projectId } : {}),
    path: artifact.path,
    width: shot.width,
    height: shot.height,
    bytes: shot.bytes.byteLength
  };
}

/** When CHECKION is configured, capture full-page JPEG and replace DIG Playwright full-page. */
export async function attachCheckionScreenshotIfConfigured(
  packageRoot: string,
  targetUrl: string,
  config: CheckionConfig = checkionConfig(),
  root = process.cwd(),
  environment: NodeJS.ProcessEnv = process.env
): Promise<AttachCheckionResult> {
  if (!isCheckionConfigured(config)) {
    return {
      attached: false,
      skipped: checkionPeerReadyReason(config) ?? "CHECKION not configured"
    };
  }
  const strictFlag = (environment.DIG_CHECKION_STRICT ?? "").trim().toLowerCase();
  const strict = strictFlag === "1" || strictFlag === "true" || strictFlag === "on";
  try {
    const shot = await captureCheckionFullPage(targetUrl, config, root);
    return applyCheckionScreenshotToPackage(packageRoot, shot);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Default: soft-fail so DIG capture/index still completes; Playwright full-page remains.
    if (!strict) {
      return { attached: false, skipped: message };
    }
    if (!config.required) {
      return { attached: false, skipped: message };
    }
    throw error;
  }
}
