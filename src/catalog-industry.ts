/**
 * Map capture URLs onto closed industry facets via catalog hosts.
 * Vertical catalogs pin industry; award/inspiration catalogs do not (vision/LLM wins).
 * @see knowledge/design-facets.md
 */
import { loadCaptureCatalog } from "./capture-catalog.js";

/** Vertical / sector catalogs only — award volume catalogs must not inject `tech`. */
const CATALOG_INDUSTRY: Record<string, string> = {
  "insurance-1000": "insurance",
  "insurance-plus-500": "insurance",
  "automotive-oem-50": "automotive",
  "engineering-manufacturing-1000": "manufacturing",
  "public-sector-1000": "government",
  "public-sector-plus-500": "government"
};

/** Inspiration sources used for quality/volume mix — no default industry tag. */
export const AWARD_CATALOG_IDS = [
  "awwwards-500",
  "awwwards-plus-1000",
  "awwwards-plus-2000",
  "awwwards-plus-3000",
  "awwwards-plus-4000",
  "siteinspire-1000",
  "cssda-wotd-1000",
  "thefwa-1000"
] as const;

const GROUP_ALIASES: Array<[RegExp, string]> = [
  [/insur|reinsurance|takaful|broker/i, "insurance"],
  [/auto|vehicle|car /i, "automotive"],
  [/bank|fintech|payment|finance/i, "finance"],
  [/retail|marketplace|commerce|shop/i, "ecommerce"],
  [/media|stream|entertainment|publish/i, "media"],
  [/tech|saas|software|telecom|technology/i, "tech"],
  [/health|pharma|hospital/i, "healthcare"],
  [/travel|airline|hotel/i, "travel"],
  [/food|grocery|restaurant/i, "food"],
  [/fashion|apparel/i, "fashion"],
  [/real estate|property|housing/i, "real_estate"],
  [/manufactur|industrial|engineer|chemical|metal|semiconductor/i, "manufacturing"],
  [/luxury/i, "luxury"],
  [/nonprofit|ngo|charity/i, "nonprofit"],
  [/government|ministry|municipality|public sector|governance|city hall|civic/i, "government"],
  [/agency|studio|creative agency|design studio|marketing agency/i, "marketing_agency"]
];

let hostIndex: Map<string, string[]> | null = null;

export function catalogHostKey(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./i, "").split("/")[0]!.toLowerCase();
  }
}

function remember(index: Map<string, string[]>, url: string, tag: string): void {
  const host = catalogHostKey(url);
  if (!host || !tag) return;
  const current = index.get(host) ?? [];
  if (current.includes(tag)) return;
  index.set(host, [...current, tag].slice(0, 3));
}

function industryFromGroup(group: string): string | null {
  for (const [pattern, tag] of GROUP_ALIASES) {
    if (pattern.test(group)) return tag;
  }
  return null;
}

/** Reset cached host→industry map (tests). */
export function clearCatalogIndustryCache(): void {
  hostIndex = null;
}

function loadHostIndex(): Map<string, string[]> {
  if (hostIndex) return hostIndex;
  const index = new Map<string, string[]>();
  for (const [catalogId, tag] of Object.entries(CATALOG_INDUSTRY)) {
    try {
      const catalog = loadCaptureCatalog(catalogId);
      for (const entry of catalog.entries) remember(index, entry.url, tag);
    } catch {
      /* catalog file optional in slim checkouts */
    }
  }
  try {
    const mixed = loadCaptureCatalog("cross-industry-100");
    for (const entry of mixed.entries) {
      const tag = industryFromGroup(entry.group) ?? industryFromGroup(entry.name);
      if (tag) remember(index, entry.url, tag);
    }
  } catch {
    /* optional */
  }
  // Award catalogs: never blanket-pin industry. Groups like "Featured" / "The FWA"
  // are not sector labels; do not infer from marketing-y site titles either.
  hostIndex = index;
  return index;
}

/** Closed industry tags for a capture URL or host. Catalog wins over guesswork. */
export function industryTagsForHost(
  canonicalUrl?: string | null,
  siteDomain?: string | null
): string[] {
  const index = loadHostIndex();
  const hosts = [catalogHostKey(canonicalUrl), catalogHostKey(siteDomain)].filter(Boolean);
  const out: string[] = [];
  for (const host of hosts) {
    for (const tag of index.get(host) ?? []) {
      if (!out.includes(tag)) out.push(tag);
    }
    if (out.length) return out.slice(0, 3);
  }
  const blob = `${canonicalUrl ?? ""} ${siteDomain ?? ""}`;
  if (/insur|versicherung|assurance|takaful|lloyds/i.test(blob)) return ["insurance"];
  return out;
}
