/**
 * Resolve IndexCaptureScope fields after graphic enrichment.
 * Connector brand-kit / campaign-motif / dribbble rows must stay craftEligible=false until review PATCH.
 */
import { craftEligibleFromLicense, normalizeLicenseClass, type LicenseClass } from "./spirion-asset.js";

export type GraphicAssetRaw = {
  asset_kind?: string;
  source?: string;
  source_id?: string;
  format?: Record<string, unknown>;
  tags?: string[];
  content_hash?: string;
  license_class?: string;
};

export function resolveConnectorSource(sourceId: string | null | undefined, sourceHint?: string | null): {
  source: string;
  isConnector: boolean;
} {
  const id = typeof sourceId === "string" ? sourceId : "";
  if (id.startsWith("brandkit_")) {
    return { source: "connector:brand_kit", isConnector: true };
  }
  if (id.startsWith("motif_")) {
    return { source: "connector:campaign_motif", isConnector: true };
  }
  if (id.startsWith("dribbble_")) {
    return { source: "connector:dribbble", isConnector: true };
  }
  const hint = typeof sourceHint === "string" ? sourceHint.trim() : "";
  if (hint.startsWith("connector:")) {
    return { source: hint, isConnector: true };
  }
  return { source: hint || "upload", isConnector: false };
}

export function graphicReindexScopeFromAssetRaw(assetRaw: GraphicAssetRaw): {
  assetKind: string;
  source: string;
  sourceId: string | null;
  format: Record<string, unknown>;
  tags: string[];
  contentHash: string | null;
  licenseClass: LicenseClass;
  craftEligible: boolean;
} {
  const sourceId = typeof assetRaw.source_id === "string" ? assetRaw.source_id : null;
  const { source, isConnector } = resolveConnectorSource(sourceId, assetRaw.source);
  const defaultLicense: LicenseClass =
    source === "connector:campaign_motif"
      ? "public_domain"
      : isConnector
        ? "connector_tos"
        : "customer_owned";
  const licenseClass = normalizeLicenseClass(assetRaw.license_class, defaultLicense);
  return {
    assetKind: typeof assetRaw.asset_kind === "string" && assetRaw.asset_kind.trim()
      ? assetRaw.asset_kind.trim()
      : "other_graphic",
    source,
    sourceId,
    format: assetRaw.format ?? {},
    tags: Array.isArray(assetRaw.tags) ? assetRaw.tags : [],
    contentHash: typeof assetRaw.content_hash === "string" ? assetRaw.content_hash : null,
    licenseClass,
    craftEligible: craftEligibleFromLicense(licenseClass, isConnector ? false : true)
  };
}
