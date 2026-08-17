/**
 * Library cards should show the DIG Playwright shot taken after cookie dismiss.
 * CHECKION JPEG is kept as SoT but often still includes CMP chrome.
 */

import { cookieConsentConfig } from "./runtime-paths.js";
import { screenshotSettings } from "./screenshot-settings.js";

export function playwrightFullPagePathBesideCheckion(checkionPath: string, root = process.cwd()): string | null {
  const { checkionFullPageSuffix, playwrightFullPageStem } = cookieConsentConfig(root);
  const extension = screenshotSettings().extension;
  const replacement = `${playwrightFullPageStem}${extension}`;
  if (checkionPath.endsWith(checkionFullPageSuffix)) {
    return `${checkionPath.slice(0, -checkionFullPageSuffix.length)}${replacement}`;
  }
  const escaped = checkionFullPageSuffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const replaced = checkionPath.replace(new RegExp(`${escaped}$`, "i"), replacement);
  return replaced === checkionPath ? null : replaced;
}

export function libraryFullPageScreenshotPath(artifacts: {
  playwright_full_page_screenshot?: { path?: string } | null;
  full_page_screenshot?: { path?: string } | null;
}, root = process.cwd()): string | null {
  const playwright = artifacts.playwright_full_page_screenshot?.path;
  if (typeof playwright === "string" && playwright.length) return playwright;
  const full = artifacts.full_page_screenshot?.path;
  if (typeof full !== "string" || !full.length) return null;
  return playwrightFullPagePathBesideCheckion(full, root) ?? full;
}

export function libraryCardScreenshotPath(
  row: {
    full_page_screenshot_path?: unknown;
    settled_screenshot_path?: unknown;
  },
  root = process.cwd()
): string | null {
  const full = typeof row.full_page_screenshot_path === "string" ? row.full_page_screenshot_path : null;
  const settled = typeof row.settled_screenshot_path === "string" ? row.settled_screenshot_path : null;
  if (full) {
    return playwrightFullPagePathBesideCheckion(full, root) ?? full;
  }
  return settled;
}
