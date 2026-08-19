/**
 * Cursor MCP library tools against DIG HTTP API (staging or local).
 * Avoids needing a local Postgres + /data/captures mount.
 */

import {
  libraryApiPath,
  libraryScreenFacetQueryKeys,
  loadDigPaths
} from "./runtime-paths.js";
import { libraryScreenFacetCatalog, publicLibraryScreenHit } from "./library-screens.js";

export type FetchLike = typeof fetch;

function apiToken(root = process.cwd()): string | null {
  const envName = loadDigPaths(root).plexon?.digApiTokenEnv ?? "DIG_API_TOKEN";
  const token = process.env[envName]?.trim();
  return token || null;
}

function headers(root = process.cwd()): Record<string, string> {
  const token = apiToken(root);
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

function libraryBase(apiBase: string): string {
  return `${apiBase.replace(/\/$/, "")}${libraryApiPath()}`;
}

export async function callDigLibraryToolHttp(
  name: "dig_screen_search" | "dig_capture_prompt_pack",
  args: Record<string, unknown>,
  apiBase: string,
  fetchImpl: FetchLike = fetch,
  root = process.cwd()
): Promise<unknown> {
  const platformProjectId =
    typeof args.platformProjectId === "string"
      ? args.platformProjectId
      : typeof args.platform_project_id === "string"
        ? args.platform_project_id
        : null;
  if (name === "dig_screen_search") {
    const facetKeys = libraryScreenFacetQueryKeys(root);
    const params = new URLSearchParams();
    if (typeof args.q === "string" && args.q.trim()) params.set("q", args.q.trim());
    const provider =
      typeof args.provider === "string" && args.provider.trim()
        ? args.provider.trim()
        : typeof args.q === "string" && args.q.trim()
          ? "dense"
          : "";
    if (provider) params.set("provider", provider);
    if (typeof args.style === "string" && args.style.trim()) params.set(facetKeys.style, args.style.trim());
    if (typeof args.layout === "string" && args.layout.trim()) params.set(facetKeys.layout, args.layout.trim());
    if (typeof args.industry === "string" && args.industry.trim()) {
      params.set(facetKeys.industry, args.industry.trim());
    }
    for (const module of Array.isArray(args.modules) ? args.modules.filter((item): item is string => typeof item === "string") : []) {
      if (module.trim()) params.append("modules", module.trim());
    }
    for (const tag of Array.isArray(args.craft_tags) ? args.craft_tags.filter((item): item is string => typeof item === "string") : []) {
      if (tag.trim()) params.append("craft_tags", tag.trim());
    }
    for (const key of [
      "imagery_density",
      "type_scale",
      "type_image_mode",
      "contrast_mode",
      "composition_energy",
      "chrome_weight"
    ] as const) {
      if (typeof args[key] === "string" && args[key].trim()) params.set(key, args[key].trim());
    }
    if (platformProjectId?.trim()) params.set("platformProjectId", platformProjectId.trim());
    const qs = params.toString();
    const url = `${libraryBase(apiBase)}/screens${qs ? `?${qs}` : ""}`;
    const response = await fetchImpl(url, { headers: headers(root) });
    const body = (await response.json()) as {
      screens?: Array<Record<string, unknown>>;
      error?: string;
      facet_filters?: unknown;
      facets_version?: string;
      provider?: string;
    };
    if (!response.ok) throw new Error(body.error ?? `screen_search_failed_${response.status}`);
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(20, Math.floor(args.limit)))
        : 20;
    const screens = (body.screens ?? [])
      .slice(0, limit)
      .map((row) =>
        publicLibraryScreenHit({
          capture_run_id: String(row.capture_run_id ?? ""),
          viewport_capture_id: String(row.viewport_capture_id ?? ""),
          name: String(row.name ?? ""),
          title: typeof row.title === "string" ? row.title : null,
          site_domain: typeof row.site_domain === "string" ? row.site_domain : null,
          canonical_url: String(row.canonical_url ?? ""),
          package_path: typeof row.package_path === "string" ? row.package_path : null,
          design_facets:
            row.design_facets && typeof row.design_facets === "object"
              ? (row.design_facets as ReturnType<typeof publicLibraryScreenHit>["design_facets"])
              : null
        })
      );
    return {
      count: screens.length,
      screens,
      ...(typeof body.provider === "string" ? { provider: body.provider } : {}),
      ...libraryScreenFacetCatalog()
    };
  }
  const captureRunId =
    typeof args.capture_run_id === "string"
      ? args.capture_run_id
      : typeof args.captureRunId === "string"
        ? args.captureRunId
        : "";
  if (!captureRunId.trim()) throw new Error("capture_run_id required");
  const url = `${libraryBase(apiBase)}/analyses/${encodeURIComponent(captureRunId.trim())}/prompt-pack`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: headers(root),
    body: JSON.stringify({
      ...(typeof args.brief === "string" ? { brief: args.brief } : {}),
      ...(platformProjectId ? { platformProjectId } : {}),
      ...(args.output_contract === "prose_brief" || args.output_contract === "both"
        ? { output_contract: args.output_contract }
        : {})
    })
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error ?? `capture_prompt_pack_failed_${response.status}`));
  return body;
}
