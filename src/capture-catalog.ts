/**
 * Capture job catalogs (OEM lists) loaded from knowledge/catalogs.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDigPaths } from "./runtime-paths.js";

export type CaptureCatalogEntry = {
  rank: number;
  id: string;
  name: string;
  group: string;
  country: string;
  url: string;
};

export type CaptureCatalog = {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string;
  year: number;
  updated?: string;
  entries: CaptureCatalogEntry[];
};

export function captureJobsConfig(root = process.cwd()): {
  maxConcurrent: number;
  batchPath: string;
  catalogsDir: string;
  automotiveOem50: string;
  crossIndustry100: string;
  engineeringManufacturing1000: string;
  insurance1000: string;
  maxBatch: number;
} {
  const cfg = loadDigPaths(root).captureJobs;
  return {
    maxConcurrent: cfg?.maxConcurrent ?? 1,
    batchPath: cfg?.batchPath ?? "/batch",
    catalogsDir: cfg?.catalogsDir ?? "knowledge/catalogs",
    automotiveOem50: cfg?.automotiveOem50 ?? "knowledge/catalogs/automotive-oem-50.json",
    crossIndustry100: cfg?.crossIndustry100 ?? "knowledge/catalogs/cross-industry-100.json",
    engineeringManufacturing1000:
      cfg?.engineeringManufacturing1000 ?? "knowledge/catalogs/engineering-manufacturing-1000.json",
    insurance1000: cfg?.insurance1000 ?? "knowledge/catalogs/insurance-1000.json",
    maxBatch: cfg?.maxBatch ?? 1000
  };
}

export function resolveCaptureCatalogPath(catalogId: string, root = process.cwd()): string {
  const cfg = captureJobsConfig(root);
  if (catalogId === "automotive-oem-50") return resolve(root, cfg.automotiveOem50);
  if (catalogId === "cross-industry-100") return resolve(root, cfg.crossIndustry100);
  if (catalogId === "engineering-manufacturing-1000") return resolve(root, cfg.engineeringManufacturing1000);
  if (catalogId === "insurance-1000") return resolve(root, cfg.insurance1000);
  return resolve(root, cfg.catalogsDir, `${catalogId}.json`);
}

export function loadCaptureCatalog(catalogId: string, root = process.cwd()): CaptureCatalog {
  const path = resolveCaptureCatalogPath(catalogId, root);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as CaptureCatalog;
  if (!parsed?.id || !Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error(`Capture catalog ${catalogId} is empty or invalid`);
  }
  return parsed;
}

export function catalogUrls(catalog: CaptureCatalog): string[] {
  return catalog.entries.map((entry) => entry.url);
}
