import { ingestPinterestPinPackage } from "./pinterest-package.js";
import { imageIngestConfig, uploadedImageUrl } from "./runtime-paths.js";
import type { CaptureManifest } from "./types.js";

export type UploadedImageIngest = {
  source_id: string;
  filename: string;
  path: string;
};

export async function ingestUploadedImagePackage(input: {
  image: Buffer;
  outputDirectory: string;
  sourceId: string;
  filename: string;
}): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
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
