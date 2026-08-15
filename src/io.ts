import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { ArtifactReference } from "./types.js";

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeArtifact(
  packageRoot: string,
  artifactPath: string,
  value: string | Uint8Array,
  mediaType: string
): Promise<ArtifactReference> {
  const absolutePath = resolve(packageRoot, artifactPath);
  await ensureDirectory(dirname(absolutePath));
  await writeFile(absolutePath, value);
  const bytes = typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
  return { path: relative(packageRoot, absolutePath), sha256: sha256(value), bytes, media_type: mediaType };
}

/** Stream JSONL to disk without concatenating one giant string (avoids Invalid string length). */
export async function writeJsonLinesArtifact(
  packageRoot: string,
  artifactPath: string,
  records: unknown[],
  mediaType = "application/x-ndjson"
): Promise<ArtifactReference> {
  const absolutePath = resolve(packageRoot, artifactPath);
  await ensureDirectory(dirname(absolutePath));
  const hash = createHash("sha256");
  let bytes = 0;
  const handle = await open(absolutePath, "w");
  try {
    for (const record of records) {
      const line = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
      hash.update(line);
      bytes += line.byteLength;
      await handle.write(line);
    }
  } finally {
    await handle.close();
  }
  return {
    path: relative(packageRoot, absolutePath),
    sha256: `sha256:${hash.digest("hex")}`,
    bytes,
    media_type: mediaType
  };
}

export function toJsonLines(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

export async function hashFile(path: string): Promise<string> {
  return sha256(await readFile(path));
}

export function safeDirectoryName(url: URL): string {
  const route = url.pathname === "/" ? "home" : url.pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `${url.hostname.replace(/[^a-zA-Z0-9.-]+/g, "-")}_${route}`.slice(0, 120);
}
