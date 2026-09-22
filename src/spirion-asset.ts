/**
 * SPIRION Welle 2 — SpirionAsset kinds, license, craft eligibility, output_contract resolve.
 * Spec: plexon specs/domain/spirion-campaign-motif-corpus.md
 */

export const SPIRION_ASSET_KINDS = [
  "web_screen",
  "campaign_keyvisual",
  "social_post",
  "print_ad",
  "brand_system",
  "moodboard",
  "other_graphic"
] as const;

export type SpirionAssetKind = (typeof SPIRION_ASSET_KINDS)[number];

export const GRAPHIC_ASSET_KINDS: ReadonlySet<SpirionAssetKind> = new Set([
  "campaign_keyvisual",
  "social_post",
  "print_ad",
  "brand_system",
  "moodboard",
  "other_graphic"
]);

export const LICENSE_CLASSES = [
  "customer_owned",
  "studio_curated",
  "connector_tos",
  "unknown"
] as const;

export type LicenseClass = (typeof LICENSE_CLASSES)[number];

export const ENRICHMENT_STATUSES = ["pending", "ready", "failed"] as const;
export type AssetEnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

/** Semantic pack contracts (Welle 2) + DIG-012 technical contracts. */
export const PACK_OUTPUT_CONTRACTS = [
  "look",
  "rhythm",
  "composition",
  "both",
  "graphic",
  "auto",
  "layout_hints_json",
  "prose_brief"
] as const;

export type PackOutputContract = (typeof PACK_OUTPUT_CONTRACTS)[number];

export type AssetFormat = {
  aspectRatio?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
  printMm?: { w?: number; h?: number } | null;
  bleedMm?: number | null;
  safeMm?: number | null;
};

export function isSpirionAssetKind(value: unknown): value is SpirionAssetKind {
  return typeof value === "string" && (SPIRION_ASSET_KINDS as readonly string[]).includes(value);
}

export function normalizeAssetKind(raw: unknown, fallback: SpirionAssetKind = "web_screen"): SpirionAssetKind {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().toLowerCase().replace(/-/g, "_");
  if (isSpirionAssetKind(trimmed)) return trimmed;
  const aliases: Record<string, SpirionAssetKind> = {
    web: "web_screen",
    screen: "web_screen",
    landing: "web_screen",
    keyvisual: "campaign_keyvisual",
    key_visual: "campaign_keyvisual",
    kv: "campaign_keyvisual",
    campaign: "campaign_keyvisual",
    social: "social_post",
    post: "social_post",
    print: "print_ad",
    ad: "print_ad",
    brand: "brand_system",
    guidelines: "brand_system",
    mood: "moodboard",
    graphic: "other_graphic",
    other: "other_graphic"
  };
  return aliases[trimmed] ?? fallback;
}

export function isGraphicAssetKind(kind: SpirionAssetKind): boolean {
  return GRAPHIC_ASSET_KINDS.has(kind);
}

export function normalizeLicenseClass(raw: unknown, fallback: LicenseClass = "unknown"): LicenseClass {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().toLowerCase();
  return (LICENSE_CLASSES as readonly string[]).includes(trimmed)
    ? (trimmed as LicenseClass)
    : fallback;
}

/**
 * WENN licenseClass=unknown → craftEligible=false by default.
 * Connector ToS assets default false until allowlist/review.
 */
export function craftEligibleFromLicense(
  licenseClass: LicenseClass,
  explicit?: boolean | null
): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (licenseClass === "unknown" || licenseClass === "connector_tos") return false;
  return true;
}

export function isPackOutputContract(value: unknown): value is PackOutputContract {
  return typeof value === "string" && (PACK_OUTPUT_CONTRACTS as readonly string[]).includes(value);
}

export function resolvePackOutputContract(
  requested: unknown,
  assetKind: SpirionAssetKind
): PackOutputContract {
  if (isPackOutputContract(requested)) {
    if (requested === "auto") {
      return isGraphicAssetKind(assetKind) ? "graphic" : "both";
    }
    return requested;
  }
  return isGraphicAssetKind(assetKind) ? "graphic" : "both";
}

export function wantsComposition(contract: PackOutputContract): boolean {
  return contract === "composition" || contract === "graphic";
}

export function wantsLook(contract: PackOutputContract): boolean {
  return (
    contract === "look" ||
    contract === "both" ||
    contract === "graphic" ||
    contract === "layout_hints_json" ||
    contract === "prose_brief"
  );
}

export function wantsRhythm(contract: PackOutputContract): boolean {
  return (
    contract === "rhythm" ||
    contract === "both" ||
    contract === "layout_hints_json" ||
    contract === "prose_brief"
  );
}

/** DIG-012 schema still validates technical output_contract values. */
export function toDigTechnicalOutputContract(
  contract: PackOutputContract
): "layout_hints_json" | "prose_brief" | "both" {
  if (contract === "prose_brief") return "prose_brief";
  if (contract === "layout_hints_json" || contract === "composition" || contract === "look") {
    return "layout_hints_json";
  }
  return "both";
}
