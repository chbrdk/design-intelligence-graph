import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Busboy } from "@fastify/busboy";
import { imageIngestConfig } from "./runtime-paths.js";
import type { UploadedImageIngest } from "./image-ingest.js";

export type SkippedUpload = {
  filename: string;
  reason: string;
};

export type ParsedImageUploads = {
  files: UploadedImageIngest[];
  skipped: SkippedUpload[];
  platformProjectId: string | null;
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export function sanitizeUploadFilename(raw: string): string {
  const base = raw.replace(/\\/g, "/").split("/").pop()?.trim() || "image";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "image";
}

export function resolveUploadMime(filename: string, mimeType: string): string | null {
  const cfg = imageIngestConfig();
  const fromHeader = mimeType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  if (cfg.allowedMime.includes(fromHeader)) return fromHeader;
  const fromExt = MIME_BY_EXT[extname(filename).toLowerCase()];
  if (fromExt && cfg.allowedMime.includes(fromExt)) return fromExt;
  return null;
}

export async function parseMultipartImageUploads(
  request: IncomingMessage,
  root = process.cwd()
): Promise<ParsedImageUploads> {
  const cfg = imageIngestConfig(root);
  const stagingDir = resolve(root, cfg.stagingDir);
  await mkdir(stagingDir, { recursive: true });
  const contentType = request.headers["content-type"];
  if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
    throw new Error("multipart_required");
  }

  const files: UploadedImageIngest[] = [];
  const skipped: SkippedUpload[] = [];
  let platformProjectId: string | null = null;

  const busboy = Busboy({
    headers: { ...request.headers, "content-type": contentType },
    limits: {
      files: cfg.maxFiles,
      fileSize: cfg.maxBytes,
      fields: 8,
      fieldSize: 4096
    }
  });

  const tasks: Promise<void>[] = [];

  busboy.on("field", (fieldname, value) => {
    if (fieldname === "platformProjectId" || fieldname === "platform_project_id") {
      const trimmed = value.trim();
      platformProjectId = trimmed || null;
    }
  });

  busboy.on("file", (fieldname, stream, filename, _encoding, mimeType) => {
    const safeName = sanitizeUploadFilename(filename || "image");
    if (fieldname !== cfg.fieldName) {
      stream.resume();
      skipped.push({ filename: safeName, reason: "unexpected_field" });
      return;
    }
    const mime = resolveUploadMime(safeName, mimeType ?? "");
    if (!mime) {
      stream.resume();
      skipped.push({ filename: safeName, reason: "unsupported_type" });
      return;
    }
    const sourceId = `upload_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const ext = extname(safeName) || extensionForMime(mime);
    const dest = join(stagingDir, `${sourceId}${ext}`);
    tasks.push(
      (async () => {
        try {
          await pipeline(stream, createWriteStream(dest));
          if (stream.truncated) {
            await unlink(dest).catch(() => undefined);
            skipped.push({ filename: safeName, reason: "too_large" });
            return;
          }
          files.push({ source_id: sourceId, filename: safeName, path: dest });
        } catch (error: unknown) {
          await unlink(dest).catch(() => undefined);
          skipped.push({
            filename: safeName,
            reason: error instanceof Error ? error.message : "write_failed"
          });
        }
      })()
    );
  });

  busboy.on("filesLimit", () => {
    skipped.push({ filename: "*", reason: "files_limit" });
  });

  await new Promise<void>((resolvePromise, reject) => {
    busboy.on("error", reject);
    busboy.on("finish", () => resolvePromise());
    request.pipe(busboy);
  });
  await Promise.all(tasks);
  return { files, skipped, platformProjectId };
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".img";
}
