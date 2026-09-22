import { ingestPinterestPinPackage } from "./pinterest-package.js";
import { ingestGraphicAssetPackage } from "./graphic-package.js";
import { imageIngestConfig, uploadedImageUrl } from "./runtime-paths.js";
import {
  isGraphicAssetKind,
  normalizeAssetKind,
  type SpirionAssetKind
} from "./spirion-asset.js";
import type { CaptureManifest } from "./types.js";

export type UploadedImageIngest = {
  source_id: string;
  filename: string;
  path: string;
  /** Optional SPIRION assetKind for graphic uploads. */
  asset_kind?: string;
};

export async function ingestUploadedImagePackage(input: {
  image: Buffer;
  outputDirectory: string;
  sourceId: string;
  filename: string;
  assetKind?: string | null;
}): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
  const kind = normalizeAssetKind(input.assetKind, "other_graphic");
  if (isGraphicAssetKind(kind)) {
    return ingestGraphicAssetPackage({
      image: input.image,
      outputDirectory: input.outputDirectory,
      sourceId: input.sourceId,
      filename: input.filename,
      assetKind: kind
    });
  }

  // Explicit web_screen uploads keep the legacy still-image → desktop viewport path.
  const cfg = imageIngestConfig();
  const canonicalUrl = uploadedImageUrl(input.sourceId);
  return ingestPinterestPinPackage({
    pin: {
      id: input.sourceId,
      title: input.filename,
      description: "",
      link: null,
      board_id: null,
      image: { url: canonicalUrl, width: 1, height: 1 }
    },
    image: input.image,
    outputDirectory: input.outputDirectory,
    canonicalUrl,
    intervention: cfg.intervention,
    browserVersion: "image-upload-ingest",
    userAgent: "spirion-image-ingest",
    experiment: `image_upload:${input.sourceId}`
  });
}

export function resolveUploadAssetKind(raw: string | null | undefined): SpirionAssetKind {
  return normalizeAssetKind(raw, "other_graphic");
}
