import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import { buildDesignFacets } from "./design-facets.js";
import type { DesignReferenceRecord } from "./design-reference-emit.js";
import {
  assembleDesignReferencePack,
  getDesignReference,
  listDesignReferencesForCapture,
  type DesignReferencePack
} from "./design-reference-library.js";
import { assembleDesignPromptPack, type PromptOutputContract } from "./design-prompt-pack.js";
import { loadDesignTokensDocument } from "./design-tokens.js";
import type { LookContract } from "./look-contract.js";
import { asLookContract } from "./look-contract.js";
import type { PageRhythm } from "./page-rhythm.js";
import { asPageRhythm, loadPageRhythmForPackage } from "./page-rhythm.js";
import { loadVisionLayoutDocument } from "./vision-layout.js";
import { loadVisionPageDocument } from "./vision-page.js";

export const COMPOSITION_BRIEF_VERSION = "0.1.0";

export type CompositionBrief = {
  schema_version: "0.1.0";
  compose_brief_version: typeof COMPOSITION_BRIEF_VERSION;
  role: "design_composition";
  intent: string;
  references: Array<{
    reference_id: string;
    capture_run_id: string;
    category: string;
    signature: string;
    source_kind: "reference";
  }>;
  module_blueprint: Array<{
    module_id: string;
    reference_id: string;
    capture_run_id: string;
    category: string;
    signature: string;
    stack_summary: string;
    look_summary: string;
    craft_tags: string[];
  }>;
  craft_constraints: string[];
  avoid: string[];
  look_contract: LookContract | null;
  page_rhythm: PageRhythm | null;
  prompt_pack: ReturnType<typeof assembleDesignPromptPack>;
  gate?: DesignReferencePack["gate"];
};

function trimString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

async function uniqueRefsForCompose(
  refs: DesignReferenceRecord[],
  client: Queryable
): Promise<DesignReferenceRecord[]> {
  const { catalogSourceScoreBoost, catalogSourceTiersForHost } = await import("./catalog-source.js");
  const ids = [...new Set(refs.map((ref) => ref.capture_run_id).filter(Boolean))];
  const domains = new Map<string, { site_domain: string | null; canonical_url: string | null }>();
  if (ids.length) {
    const result = await client.query(
      `SELECT capture_run_id, site_domain, canonical_url FROM captures WHERE capture_run_id = ANY($1::text[])`,
      [ids]
    );
    for (const row of result.rows as Array<{
      capture_run_id?: unknown;
      site_domain?: unknown;
      canonical_url?: unknown;
    }>) {
      const id = String(row.capture_run_id ?? "");
      if (!id) continue;
      domains.set(id, {
        site_domain: typeof row.site_domain === "string" ? row.site_domain : null,
        canonical_url: typeof row.canonical_url === "string" ? row.canonical_url : null
      });
    }
  }

  const ranked = [...refs].sort((a, b) => {
    const da = domains.get(a.capture_run_id);
    const db = domains.get(b.capture_run_id);
    const sa = catalogSourceScoreBoost({
      canonicalUrl: da?.canonical_url,
      siteDomain: da?.site_domain
    });
    const sb = catalogSourceScoreBoost({
      canonicalUrl: db?.canonical_url,
      siteDomain: db?.site_domain
    });
    if (sb !== sa) return sb - sa;
    const ta = catalogSourceTiersForHost(da?.canonical_url, da?.site_domain);
    const tb = catalogSourceTiersForHost(db?.canonical_url, db?.site_domain);
    if (ta === "quality" && tb !== "quality") return -1;
    if (tb === "quality" && ta !== "quality") return 1;
    return 0;
  });

  const seenRef = new Set<string>();
  const seenDomain = new Set<string>();
  const out: DesignReferenceRecord[] = [];
  const deferred: DesignReferenceRecord[] = [];
  for (const ref of ranked) {
    if (!ref.reference_id || seenRef.has(ref.reference_id)) continue;
    const host = (domains.get(ref.capture_run_id)?.site_domain ?? "").toLowerCase().replace(/^www\./, "");
    if (host && seenDomain.has(host)) {
      deferred.push(ref);
      continue;
    }
    seenRef.add(ref.reference_id);
    if (host) seenDomain.add(host);
    out.push(ref);
    if (out.length >= 8) return out;
  }
  for (const ref of deferred) {
    if (seenRef.has(ref.reference_id)) continue;
    seenRef.add(ref.reference_id);
    out.push(ref);
    if (out.length >= 8) break;
  }
  return out;
}

function buildCraftConstraints(refs: DesignReferenceRecord[], facets: ReturnType<typeof buildDesignFacets>): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    if (!value || out.includes(value)) return;
    out.push(value);
  };
  push(facets.contrast_mode ? `contrast_mode:${facets.contrast_mode}` : null);
  push(facets.type_scale ? `type_scale:${facets.type_scale}` : null);
  push(facets.type_image_mode ? `type_image_mode:${facets.type_image_mode}` : null);
  push(facets.imagery_density ? `imagery_density:${facets.imagery_density}` : null);
  push(facets.chrome_weight ? `chrome_weight:${facets.chrome_weight}` : null);
  for (const tag of facets.craft_tags) push(`craft_tag:${tag}`);
  for (const ref of refs) {
    for (const tag of ref.craft?.craft_tags ?? []) push(`craft_tag:${tag}`);
    if (ref.craft?.type_image_mode) push(`module_type_image_mode:${ref.craft.type_image_mode}`);
    if (ref.craft?.composition_energy) push(`module_composition_energy:${ref.craft.composition_energy}`);
  }
  return out.slice(0, 16);
}

async function resolveCaptureRunIdFromScreenId(
  client: Queryable,
  primaryScreenId: string
): Promise<string | null> {
  const result = await client.query(
    "SELECT capture_run_id FROM viewports WHERE viewport_capture_id = $1 LIMIT 1",
    [primaryScreenId]
  );
  const row = result.rows[0] as { capture_run_id?: string } | undefined;
  return typeof row?.capture_run_id === "string" ? row.capture_run_id : null;
}

async function loadCaptureContext(client: Queryable, captureRunId: string, platformProjectId?: string | null) {
  const capture = await client.query(
    `SELECT package_path, platform_project_id FROM captures WHERE capture_run_id = $1 LIMIT 1`,
    [captureRunId]
  );
  const row = capture.rows[0] as { package_path?: string; platform_project_id?: string | null } | undefined;
  if (!row?.package_path) throw new Error("capture_not_found");
  const effectivePlatformProjectId = platformProjectId ?? row.platform_project_id ?? null;
  const tokens = await loadDesignTokensDocument(row.package_path).catch(() => null);
  const visionPage = await loadVisionPageDocument(row.package_path).catch(() => null);
  const visionLayout = await loadVisionLayoutDocument(row.package_path).catch(() => null);
  const facets = buildDesignFacets({
    vision_page: visionPage,
    bands: visionLayout?.bands ?? [],
    tokens
  });
  const look_contract = facets.look_contract;
  const page_rhythm = await loadPageRhythmForPackage(row.package_path).catch(() => null);
  return {
    packagePath: row.package_path,
    platformProjectId: effectivePlatformProjectId,
    tokens,
    visionPage,
    facets,
    look_contract,
    page_rhythm
  };
}

export async function assembleCompositionBrief(
  body: Record<string, unknown>,
  client: Queryable | null = getPool()
): Promise<CompositionBrief> {
  if (!client) throw new Error("database_unavailable");
  const intent = trimString(body.intent);
  if (!intent) throw new Error("intent required");
  const explicitReferenceIds = stringArray(body.reference_ids);
  const captureRunIds = stringArray(body.capture_run_ids);
  const primaryScreenId = trimString(body.primary_screen_id) ?? trimString(body.primaryScreenId);
  const platformProjectId = trimString(body.platformProjectId) ?? trimString(body.platform_project_id);
  const output_contract =
    body.output_contract === "prose_brief" || body.output_contract === "both"
      ? (body.output_contract as PromptOutputContract)
      : "layout_hints_json";

  const references: DesignReferenceRecord[] = [];
  for (const id of explicitReferenceIds) {
    const ref = await getDesignReference(id, { platformProjectId }, client);
    if (!ref) throw new Error(`Unknown reference_id: ${id}`);
    references.push(ref);
  }

  let screenCaptureRunId: string | null = null;
  if (primaryScreenId) {
    screenCaptureRunId = await resolveCaptureRunIdFromScreenId(client, primaryScreenId);
    if (!screenCaptureRunId) throw new Error("screen_not_found");
  }

  for (const captureRunId of [...captureRunIds, ...(screenCaptureRunId ? [screenCaptureRunId] : [])]) {
    const listed = await listDesignReferencesForCapture(captureRunId, { platformProjectId, limit: 4 }, client);
    references.push(...listed);
  }

  const unique = await uniqueRefsForCompose(references, client);
  if (!unique.length) throw new Error("reference_ids or capture_run_ids required");

  const pack = await assembleDesignReferencePack(
    {
      intent,
      reference_ids: unique.map((ref) => ref.reference_id),
      synthesis_mode: "look_conditioned",
      platformProjectId: platformProjectId ?? null
    },
    client
  );
  const gatedRefs = pack.references;
  const anchorCaptureRunId = gatedRefs[0]!.capture_run_id;
  const context = await loadCaptureContext(client, anchorCaptureRunId, platformProjectId);
  const look_contract = asLookContract(body.look_contract) ?? context.look_contract;
  const page_rhythm = asPageRhythm(body.page_rhythm) ?? context.page_rhythm;

  const craft_constraints = buildCraftConstraints(gatedRefs, context.facets);
  const brief =
    trimString(body.brief) ??
    `${intent}. Compose from cited references, keep measured look_contract literal, and combine module craft without copying source marketing text.`;
  const prompt_pack = assembleDesignPromptPack({
    brief,
    pack,
    output_contract,
    look_contract,
    page_rhythm,
    tokens: context.tokens,
    layout: context.facets.layout,
    style: context.facets.style,
    spacing_feel: context.visionPage?.spacing_feel ?? null,
    visual_craft: context.visionPage?.visual_craft ?? null
  });
  return {
    schema_version: "0.1.0",
    compose_brief_version: COMPOSITION_BRIEF_VERSION,
    role: "design_composition",
    intent,
    references: gatedRefs.map((ref) => ({
      reference_id: ref.reference_id,
      capture_run_id: ref.capture_run_id,
      category: ref.taxonomy.category,
      signature: ref.composition.signature,
      source_kind: "reference"
    })),
    module_blueprint: gatedRefs.slice(0, 6).map((ref, index) => ({
      module_id: `mod_${index + 1}`,
      reference_id: ref.reference_id,
      capture_run_id: ref.capture_run_id,
      category: ref.taxonomy.category,
      signature: ref.composition.signature,
      stack_summary: ref.composition.stack_summary,
      look_summary: ref.look.look_summary,
      craft_tags: ref.craft?.craft_tags ?? []
    })),
    craft_constraints,
    avoid: [...new Set([...(look_contract?.avoid ?? []), ...(page_rhythm?.avoid ?? [])])],
    look_contract,
    page_rhythm,
    prompt_pack,
    ...(pack.gate ? { gate: pack.gate } : {})
  };
}
