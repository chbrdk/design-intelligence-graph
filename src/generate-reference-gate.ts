/**
 * Phase 5 — Eval gate before look-conditioned generate / compose.
 * Require diverse domains + limited style repeats; top up from search when short.
 * @see knowledge/design-facets.md
 */
import type { Queryable } from "./db.js";
import { normalizeStyleLabel } from "./design-facets.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import { loadDigPaths } from "./runtime-paths.js";
import { catalogHostKey } from "./catalog-industry.js";

export type GenerateReferenceGateConfig = {
  enabled: boolean;
  minDomains: number;
  maxSameStyle: number;
  minReferences: number;
  maxReferences: number;
  topUpLimit: number;
};

export type GenerateReferenceGateReport = {
  ok: boolean;
  domain_count: number;
  max_style_count: number;
  reference_count: number;
  topped_up: string[];
  warnings: string[];
  domains: string[];
  styles: string[];
};

export function generateReferenceGateConfig(root = process.cwd()): GenerateReferenceGateConfig {
  const cfg = loadDigPaths(root).generateReferenceGate;
  const num = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  };
  return {
    enabled: cfg?.enabled !== false,
    minDomains: num(cfg?.minDomains, 3),
    maxSameStyle: num(cfg?.maxSameStyle, 2),
    minReferences: num(cfg?.minReferences, 3),
    maxReferences: Math.max(num(cfg?.maxReferences, 6), num(cfg?.minReferences, 3)),
    topUpLimit: num(cfg?.topUpLimit, 24)
  };
}

export function styleLabelForReference(ref: DesignReferenceRecord): string | null {
  const raw =
    ref.tokens?.style_labels?.find((item) => String(item ?? "").trim()) ??
    ref.page_context?.visual_style_labels?.find((item) => String(item ?? "").trim()) ??
    null;
  if (!raw) return null;
  const normalized = normalizeStyleLabel(String(raw));
  if (normalized) return normalized;
  const fallback = String(raw).trim().toLowerCase();
  return fallback || null;
}

export function evaluateGenerateReferenceGate(
  refs: DesignReferenceRecord[],
  domainsByCapture: Map<string, string | null>,
  config: GenerateReferenceGateConfig = generateReferenceGateConfig()
): GenerateReferenceGateReport {
  const domains: string[] = [];
  const styles: string[] = [];
  const styleCounts = new Map<string, number>();

  for (const ref of refs) {
    const host = catalogHostKey(domainsByCapture.get(ref.capture_run_id) ?? null);
    if (host && !domains.includes(host)) domains.push(host);
    const style = styleLabelForReference(ref);
    if (style) {
      styles.push(style);
      styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
    }
  }

  const maxStyleCount = [...styleCounts.values()].reduce((a, b) => Math.max(a, b), 0);
  const warnings: string[] = [];
  if (refs.length < config.minReferences) {
    warnings.push(`need_at_least_${config.minReferences}_references`);
  }
  if (domains.length < config.minDomains) {
    warnings.push(`need_at_least_${config.minDomains}_domains`);
  }
  if (maxStyleCount > config.maxSameStyle) {
    warnings.push(`style_repeat_exceeds_${config.maxSameStyle}`);
  }

  return {
    ok: warnings.length === 0,
    domain_count: domains.length,
    max_style_count: maxStyleCount,
    reference_count: refs.length,
    topped_up: [],
    warnings,
    domains,
    styles: [...styleCounts.keys()]
  };
}

async function loadCaptureDomains(
  client: Queryable,
  captureRunIds: string[]
): Promise<Map<string, string | null>> {
  const ids = [...new Set(captureRunIds.map(String).filter(Boolean))];
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const result = await client.query(
    `SELECT capture_run_id, site_domain, canonical_url
     FROM captures
     WHERE capture_run_id = ANY($1::text[])`,
    [ids]
  );
  for (const row of result.rows as Array<{
    capture_run_id?: unknown;
    site_domain?: unknown;
    canonical_url?: unknown;
  }>) {
    const id = String(row.capture_run_id ?? "");
    if (!id) continue;
    const domain =
      (typeof row.site_domain === "string" && row.site_domain) ||
      (typeof row.canonical_url === "string" && row.canonical_url) ||
      null;
    out.set(id, domain);
  }
  return out;
}

function pickTopUpCandidate(
  candidate: DesignReferenceRecord,
  selected: DesignReferenceRecord[],
  domainsByCapture: Map<string, string | null>,
  config: GenerateReferenceGateConfig
): boolean {
  if (selected.some((ref) => ref.reference_id === candidate.reference_id)) return false;
  const host = catalogHostKey(domainsByCapture.get(candidate.capture_run_id) ?? null);
  const selectedHosts = new Set(
    selected
      .map((ref) => catalogHostKey(domainsByCapture.get(ref.capture_run_id) ?? null))
      .filter(Boolean)
  );
  const style = styleLabelForReference(candidate);
  const styleCounts = new Map<string, number>();
  for (const ref of selected) {
    const label = styleLabelForReference(ref);
    if (!label) continue;
    styleCounts.set(label, (styleCounts.get(label) ?? 0) + 1);
  }
  // Prefer new domains first while below minDomains
  if (host && selectedHosts.has(host) && selectedHosts.size < config.minDomains) return false;
  if (style && (styleCounts.get(style) ?? 0) >= config.maxSameStyle) return false;
  return true;
}

/**
 * Enforce diversity gate: top up from intent search when domains/styles are sticky.
 */
export async function ensureGenerateReferenceGate(
  client: Queryable,
  intent: string,
  refs: DesignReferenceRecord[],
  opts: {
    platformProjectId?: string | null | undefined;
    root?: string | undefined;
    style?: string | null | undefined;
    industry?: string | null | undefined;
  } = {}
): Promise<{ references: DesignReferenceRecord[]; gate: GenerateReferenceGateReport }> {
  const root = opts.root ?? process.cwd();
  const config = generateReferenceGateConfig(root);
  let selected = [...refs].slice(0, config.maxReferences);
  let domains = await loadCaptureDomains(
    client,
    selected.map((ref) => ref.capture_run_id)
  );
  let gate = evaluateGenerateReferenceGate(selected, domains, config);
  if (!config.enabled) {
    return { references: selected, gate: { ...gate, ok: true, warnings: [] } };
  }
  if (gate.ok && selected.length >= config.minReferences) {
    return { references: selected, gate };
  }

  const toppedUp: string[] = [];
  try {
    const { searchDesignReferences } = await import("./design-reference-library.js");
    const candidates = await searchDesignReferences(
      {
        q: intent,
        style: opts.style ?? undefined,
        industry: opts.industry ?? undefined,
        platformProjectId: opts.platformProjectId,
        limit: config.topUpLimit
      },
      client
    );
    const candidateDomains = await loadCaptureDomains(
      client,
      candidates.map((ref) => ref.capture_run_id)
    );
    for (const [id, domain] of candidateDomains) domains.set(id, domain);

    for (const candidate of candidates) {
      if (selected.length >= config.maxReferences) break;
      gate = evaluateGenerateReferenceGate(selected, domains, config);
      if (gate.ok && selected.length >= config.minReferences) break;
      if (!pickTopUpCandidate(candidate, selected, domains, config)) continue;
      selected.push(candidate);
      toppedUp.push(candidate.reference_id);
    }
  } catch {
    /* search unavailable — return best effort */
  }

  domains = await loadCaptureDomains(
    client,
    selected.map((ref) => ref.capture_run_id)
  );
  gate = evaluateGenerateReferenceGate(selected, domains, config);
  gate.topped_up = toppedUp;
  return { references: selected, gate };
}
