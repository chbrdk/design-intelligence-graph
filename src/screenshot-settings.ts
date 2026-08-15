import { loadDigPaths } from "./runtime-paths.js";

export type ScreenshotFormat = "webp" | "png";

export interface ScreenshotSettings {
  format: ScreenshotFormat;
  quality: number;
  extension: ".webp" | ".png";
  mediaType: "image/webp" | "image/png";
}

export function screenshotSettings(): ScreenshotSettings {
  const limits = loadDigPaths().captureLimits as {
    screenshotFormat?: string;
    webpQuality?: number;
  } | undefined;
  const format = limits?.screenshotFormat === "png" ? "png" : "webp";
  const qualityRaw = Number(limits?.webpQuality ?? 80);
  const quality = Number.isFinite(qualityRaw) ? Math.min(100, Math.max(1, Math.round(qualityRaw))) : 80;
  if (format === "png") {
    return { format: "png", quality, extension: ".png", mediaType: "image/png" };
  }
  return { format: "webp", quality, extension: ".webp", mediaType: "image/webp" };
}

export function screenshotOptions(fullPage = false): {
  type: ScreenshotFormat;
  quality?: number;
  fullPage: boolean;
} {
  const settings = screenshotSettings();
  if (settings.format === "webp") {
    return { type: "webp", quality: settings.quality, fullPage };
  }
  return { type: "png", fullPage };
}
