/**
 * Artboard composition_contract for campaign / graphic SPIRION assets.
 * Spec: plexon specs/domain/spirion-campaign-motif-corpus.md
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import { loadDigPaths } from "./runtime-paths.js";
import type { AssetFormat } from "./spirion-asset.js";

export const COMPOSITION_CONTRACT_VERSION = "0.1.0" as const;

export type CompositionNegativeSpace = "tight" | "balanced" | "airy";

export type CompositionTypeRoles = {
  display?: string | null;
  title?: string | null;
  body?: string | null;
  legal?: string | null;
};

export type CompositionColorAxes = {
  dominant?: string | null;
  accent?: string | null;
  ground?: string | null;
};

export type CompositionMarginBleed = {
  safeRel?: number | null;
  bleedRel?: number | null;
  quietZoneRel?: number | null;
};

export type CompositionContract = {
  schema_version: "0.1.0";
  composition_contract_version: typeof COMPOSITION_CONTRACT_VERSION;
  focal: string | null;
  hierarchy: string[];
  negativeSpace: CompositionNegativeSpace | null;
  typeRoles: CompositionTypeRoles;
  colorAxes: CompositionColorAxes;
  marginBleed: CompositionMarginBleed;
  layoutFamily: string | null;
  avoid: string[];
  ctaRole: "present" | "absent" | null;
};

export const GENERIC_COMPOSITION_AVOID = [
  "equal-three-icon-row",
  "busy-center",
  "tiny-legal-collision",
  "fake web hero scroll bands",
  "glassmorphic frosted panels as default",
  "generic purple-to-indigo gradient fill"
] as const;

function hexFromRgb(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

export function aspectRatioLabel(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "unknown";
  }
  const ratio = width / height;
  const known: Array<[string, number]> = [
    ["1:1", 1],
    ["4:5", 0.8],
    ["9:16", 9 / 16],
    ["16:9", 16 / 9],
    ["3:2", 1.5],
    ["2:3", 2 / 3],
    ["4:3", 4 / 3],
    ["3:4", 0.75]
  ];
  for (const [label, target] of known) {
    if (Math.abs(ratio - target) < 0.04) return label;
  }
  const g = gcd(width, height);
  return `${Math.round(width / g)}:${Math.round(height / g)}`;
}

export function guessLayoutFamily(aspect: string, width: number, height: number): string {
  if (aspect === "9:16" || (height > 0 && width / height < 0.7)) return "full-bleed-product";
  if (aspect === "1:1" || aspect === "4:5") return "centered-lockup";
  if (aspect === "16:9") return "split-claim-media";
  if (width > height * 1.3) return "editorial-column";
  return "centered-lockup";
}

export function emptyCompositionContract(): CompositionContract {
  return {
    schema_version: "0.1.0",
    composition_contract_version: COMPOSITION_CONTRACT_VERSION,
    focal: null,
    hierarchy: [],
    negativeSpace: null,
    typeRoles: {},
    colorAxes: {},
    marginBleed: {},
    layoutFamily: null,
    avoid: [...GENERIC_COMPOSITION_AVOID],
    ctaRole: null
  };
}

export function asCompositionContract(raw: unknown): CompositionContract | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const avoid = Array.isArray(o.avoid)
    ? o.avoid.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [...GENERIC_COMPOSITION_AVOID];
  const hierarchy = Array.isArray(o.hierarchy)
    ? o.hierarchy.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const ns = o.negativeSpace;
  const negativeSpace =
    ns === "tight" || ns === "balanced" || ns === "airy" ? ns : null;
  const cta = o.ctaRole;
  const ctaRole = cta === "present" || cta === "absent" ? cta : null;
  const typeRoles =
    o.typeRoles && typeof o.typeRoles === "object" ? (o.typeRoles as CompositionTypeRoles) : {};
  const colorAxes =
    o.colorAxes && typeof o.colorAxes === "object" ? (o.colorAxes as CompositionColorAxes) : {};
  const marginBleed =
    o.marginBleed && typeof o.marginBleed === "object"
      ? (o.marginBleed as CompositionMarginBleed)
      : {};
  return {
    schema_version: "0.1.0",
    composition_contract_version: COMPOSITION_CONTRACT_VERSION,
    focal: typeof o.focal === "string" ? o.focal : null,
    hierarchy: hierarchy.length ? hierarchy : ["claim", "support"],
    negativeSpace,
    typeRoles,
    colorAxes,
    marginBleed,
    layoutFamily: typeof o.layoutFamily === "string" ? o.layoutFamily : null,
    avoid: avoid.length ? [...new Set(avoid)] : [...GENERIC_COMPOSITION_AVOID],
    ctaRole
  };
}

export function compositionContractRelativePath(root = process.cwd()): string {
  return loadDigPaths(root).compositionContract?.relativePath ?? "derived/composition-contract.json";
}

export async function writeCompositionContract(
  packageRoot: string,
  contract: CompositionContract,
  root = process.cwd()
): Promise<string> {
  const rel = compositionContractRelativePath(root);
  const dest = resolve(packageRoot, rel);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  return dest;
}

export async function loadCompositionContract(
  packageRoot: string,
  root = process.cwd()
): Promise<CompositionContract | null> {
  try {
    const rel = compositionContractRelativePath(root);
    const raw = JSON.parse(await readFile(resolve(packageRoot, rel), "utf8")) as unknown;
    return asCompositionContract(raw);
  } catch {
    return null;
  }
}

export function compositionContractRules(contract: CompositionContract): string[] {
  const rules: string[] = [
    "If composition_contract is present, treat the asset as a single artboard — not a scroll page.",
    "Do not invent web page_rhythm bands for graphic/campaign craft."
  ];
  if (contract.layoutFamily) {
    rules.push(`Prefer layoutFamily=${contract.layoutFamily} as the primary composition pattern.`);
  }
  if (contract.focal) {
    rules.push(`Keep focal attention on: ${contract.focal}.`);
  }
  if (contract.hierarchy.length) {
    rules.push(`Respect hierarchy order: ${contract.hierarchy.join(" → ")}.`);
  }
  if (contract.negativeSpace) {
    rules.push(`Negative space feel: ${contract.negativeSpace}.`);
  }
  for (const item of contract.avoid.slice(0, 8)) {
    rules.push(`Avoid: ${item}.`);
  }
  if (contract.ctaRole === "absent") {
    rules.push("No web CTA required — claim/lockup may stand alone.");
  }
  return rules;
}

export async function hashImageBuffer(image: Buffer): Promise<string> {
  return createHash("sha256").update(image).digest("hex");
}

export type GraphicEnrichmentResult = {
  composition_contract: CompositionContract;
  format: AssetFormat;
  tags: string[];
  content_hash: string;
  thin: boolean;
};

/**
 * Deterministic graphic enrichment from image bytes (no LLM required).
 * Vision/LLM may refine later; this gets assets to enrichmentStatus=ready.
 */
export async function enrichGraphicFromImage(image: Buffer): Promise<GraphicEnrichmentResult> {
  const content_hash = await hashImageBuffer(image);
  const pipeline = sharp(image, { failOn: "none" }).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const aspect = aspectRatioLabel(width, height);
  const stats = await sharp(image, { failOn: "none" }).stats();
  const channels = stats.channels ?? [];
  const r = channels[0]?.mean ?? 128;
  const g = channels[1]?.mean ?? 128;
  const b = channels[2]?.mean ?? 128;
  const ground = hexFromRgb(r, g, b);
  const accent = hexFromRgb(Math.min(255, r + 40), Math.max(0, g - 20), Math.min(255, b + 30));
  const dominant = hexFromRgb(Math.max(0, r - 30), Math.max(0, g - 30), Math.max(0, b - 30));

  const entropy =
    (channels[0]?.stdev ?? 0) + (channels[1]?.stdev ?? 0) + (channels[2]?.stdev ?? 0);
  // Tiny canvases or near-empty flat fields — not usable craft references.
  const thin = width < 64 || height < 64 || (width * height < 10_000 && entropy < 8);

  const layoutFamily = guessLayoutFamily(aspect, width, height);
  const negativeSpace: CompositionNegativeSpace =
    entropy < 40 ? "airy" : entropy > 90 ? "tight" : "balanced";

  const contract = asCompositionContract({
    focal: layoutFamily.includes("product") ? "product" : "claim",
    hierarchy: ["brand", "claim", "support"],
    negativeSpace,
    typeRoles: {
      display: "relative large (artboard headline)",
      title: "relative medium",
      body: "relative small",
      legal: "relative micro"
    },
    colorAxes: { dominant, accent, ground },
    marginBleed: {
      safeRel: 0.06,
      bleedRel: 0.02,
      quietZoneRel: negativeSpace === "airy" ? 0.12 : 0.06
    },
    layoutFamily,
    avoid: [
      ...GENERIC_COMPOSITION_AVOID,
      ...(thin ? ["craft-thin empty canvas", "illegible watermark spam"] : [])
    ],
    ctaRole: "absent"
  })!;

  const format: AssetFormat = {
    aspectRatio: aspect,
    widthPx: width || null,
    heightPx: height || null
  };
  const tags = [
    `aspect:${aspect}`,
    `layout:${layoutFamily}`,
    `space:${negativeSpace}`,
    ...(thin ? ["craft-thin"] : ["craft-ok"])
  ];

  return { composition_contract: contract, format, tags, content_hash, thin };
}
