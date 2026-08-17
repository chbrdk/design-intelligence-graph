import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createId } from "./io.js";
import type { Queryable } from "./db.js";
import { getPool } from "./db.js";
import { searchEmbeddings } from "./embeddings.js";
import { buildFigmaExport } from "./figma-export.js";
import { libraryApiPath } from "./runtime-paths.js";
import { rejectIfUnauthorized } from "./api-auth.js";
import type { SectionCompositionDocument } from "./section-composition.js";
import type { CaptureManifest } from "./types.js";
import { buildDesignFacets } from "./design-facets.js";
import { loadDesignTokensDocument, type DesignTokensDocument } from "./design-tokens.js";
import { asLookContract } from "./look-contract.js";
import { loadVisionLayoutDocument } from "./vision-layout.js";
import { loadVisionPageDocument } from "./vision-page.js";

type Box = { x: number; y: number; width: number; height: number };

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  response.end(JSON.stringify(body));
}

function queryParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name);
  return value && value.trim() ? value.trim() : null;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asBox(value: unknown): Box | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

function normalizeBox(box: Box, viewportWidth: number | null, viewportHeight: number | null): Box | null {
  if (!viewportWidth || !viewportHeight || viewportWidth <= 0 || viewportHeight <= 0) return null;
  return {
    x: box.x / viewportWidth,
    y: box.y / viewportHeight,
    width: box.width / viewportWidth,
    height: box.height / viewportHeight
  };
}

export function buildHotspotsFromSection(row: {
  section_id?: unknown;
  category?: unknown;
  signature?: unknown;
  root_box?: unknown;
  recipe?: unknown;
  viewport_width?: unknown;
  viewport_height?: unknown;
  /** When set (full-page media), normalize against document height instead of CSS viewport. */
  document_width?: unknown;
  document_height?: unknown;
}): Array<{
  section_id: string;
  label: string;
  role: string;
  box: Box;
  normalized: Box | null;
}> {
  const sectionId = String(row.section_id ?? "");
  const category = typeof row.category === "string" ? row.category : "section";
  const signature = typeof row.signature === "string" ? row.signature : "";
  const vw = typeof row.viewport_width === "number" ? row.viewport_width : Number(row.viewport_width);
  const vh = typeof row.viewport_height === "number" ? row.viewport_height : Number(row.viewport_height);
  const dw = typeof row.document_width === "number" ? row.document_width : Number(row.document_width);
  const dh = typeof row.document_height === "number" ? row.document_height : Number(row.document_height);
  const viewportWidth = Number.isFinite(dw) && dw > 0 ? dw : Number.isFinite(vw) ? vw : null;
  const viewportHeight = Number.isFinite(dh) && dh > 0 ? dh : Number.isFinite(vh) ? vh : null;
  const hotspots: Array<{
    section_id: string;
    label: string;
    role: string;
    box: Box;
    normalized: Box | null;
  }> = [];

  const root = asBox(row.root_box);
  if (root) {
    hotspots.push({
      section_id: sectionId,
      label: signature || category,
      role: "section",
      box: root,
      normalized: normalizeBox(root, viewportWidth, viewportHeight)
    });
  }

  const recipe = Array.isArray(row.recipe) ? row.recipe : [];
  for (const step of recipe) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const record = step as Record<string, unknown>;
    if (record.kind !== "role") continue;
    const box = asBox(record.box);
    if (!box) continue;
    const role = typeof record.role === "string" ? record.role : "unknown";
    hotspots.push({
      section_id: sectionId,
      label: role,
      role,
      box,
      normalized: normalizeBox(box, viewportWidth, viewportHeight)
    });
  }
  return hotspots;
}

function mediaUrl(base: string, captureRunId: string, relativePath: string | null): string | null {
  if (!relativePath) return null;
  return `${base}/media?capture_run_id=${encodeURIComponent(captureRunId)}&path=${encodeURIComponent(relativePath)}`;
}

function screenMediaUrls(
  base: string,
  captureRunId: string,
  row: { settled_screenshot_path?: unknown; full_page_screenshot_path?: unknown }
): { settled_url: string | null; full_page_url: string | null; primary_url: string | null } {
  const settledPath = typeof row.settled_screenshot_path === "string" ? row.settled_screenshot_path : null;
  const fullPath = typeof row.full_page_screenshot_path === "string" ? row.full_page_screenshot_path : null;
  const settled_url = mediaUrl(base, captureRunId, settledPath);
  const full_page_url = mediaUrl(base, captureRunId, fullPath);
  return {
    settled_url,
    full_page_url,
    primary_url: full_page_url ?? settled_url
  };
}

export async function handleLibraryApi(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  client: Queryable | null = getPool()
): Promise<boolean> {
  const base = libraryApiPath().replace(/\/$/, "");
  if (!requestUrl.pathname.startsWith(base)) return false;

  const path = requestUrl.pathname.slice(base.length) || "/";

  if (path === "/references" || path.startsWith("/references/")) {
    if (rejectIfUnauthorized(request, response)) return true;
  }

  if (path === "/flows/seed") {
    if (rejectIfUnauthorized(request, response)) return true;
  }

  // DIG-011 Library flows: file-backed; no Postgres required (media enrichment optional).
  if (request.method === "POST" && path === "/flows/seed") {
    try {
      const body = await readJsonBody(request);
      const domainScanId =
        typeof body.domain_scan_id === "string"
          ? body.domain_scan_id
          : typeof body.domainScanId === "string"
            ? body.domainScanId
            : null;
      const appScopeId =
        typeof body.app_scope_id === "string"
          ? body.app_scope_id
          : typeof body.appScopeId === "string"
            ? body.appScopeId
            : null;
      if (!domainScanId || !appScopeId) {
        sendJson(response, 400, { error: "domain_scan_id and app_scope_id are required" });
        return true;
      }
      const enqueueCaptures =
        body.enqueue_captures === true ||
        body.enqueueCaptures === true ||
        body.enqueue_captures === "1";
      const maxUrlsRaw = body.max_urls ?? body.maxUrls;
      const maxUrls = typeof maxUrlsRaw === "number" ? maxUrlsRaw : Number(maxUrlsRaw);

      let captures: Array<{ capture_run_id: string; canonical_url: string }> = [];
      if (client) {
        const listed = await client.query(
          `SELECT capture_run_id, canonical_url
           FROM captures
           WHERE canonical_url IS NOT NULL
           ORDER BY indexed_at DESC
           LIMIT 500`
        );
        captures = (listed.rows as Array<{ capture_run_id: unknown; canonical_url: unknown }>)
          .map((row) => ({
            capture_run_id: String(row.capture_run_id ?? ""),
            canonical_url: String(row.canonical_url ?? "")
          }))
          .filter((row) => row.capture_run_id && row.canonical_url);
      }

      const { runCheckionDomainSeed } = await import("./flow-seed.js");
      const maxUrlsResolved = Number.isFinite(maxUrls) && maxUrls > 0 ? maxUrls : undefined;
      const result = await runCheckionDomainSeed({
        domainScanId,
        appScopeId,
        persist: true,
        captures,
        ...(maxUrlsResolved !== undefined ? { maxUrls: maxUrlsResolved } : {}),
        ...(enqueueCaptures ? {} : { enqueueCapture: async () => undefined })
      });

      sendJson(response, 200, {
        seed_source: result.session.seed_source,
        seed_ref: result.session.seed_ref,
        flow_session_id: result.session.flow_session_id,
        app_scope_id: result.session.app_scope_id,
        urls: result.session.urls,
        session_path: result.session_path,
        matched_capture_run_ids: result.matched.map((item) => item.capture_run_id),
        missing_urls: result.missing_urls,
        enqueued_jobs: result.enqueued_jobs,
        edge_count: result.edges?.edges.length ?? 0,
        edges: result.edges
      });
    } catch (error: unknown) {
      sendJson(response, 502, {
        error: "flow_seed_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "GET" && path === "/flows" && !queryParam(requestUrl, "capture_run_id")) {
    const {
      loadFlowLibraryGraphs,
      listFlowsEnvelope
    } = await import("./flow-library.js");
    const graphs = await loadFlowLibraryGraphs();
    const limitRaw = queryParam(requestUrl, "limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    sendJson(
      response,
      200,
      listFlowsEnvelope(graphs, {
        flow_action: queryParam(requestUrl, "flow_action"),
        app_scope_id: queryParam(requestUrl, "app_scope_id"),
        q: queryParam(requestUrl, "q"),
        limit: Number.isFinite(limit) ? limit : 20
      })
    );
    return true;
  }

  const flowInteractive = path.match(/^\/flows\/([^/]+)\/interactive$/);
  if (request.method === "GET" && flowInteractive) {
    const flowId = decodeURIComponent(flowInteractive[1] ?? "");
    const {
      loadFlowLibraryGraphs,
      getFlowInteractiveEnvelope,
      resolveFlowScreenMedia
    } = await import("./flow-library.js");
    const graphs = await loadFlowLibraryGraphs();
    const graph = graphs.find((item) => item.flow_id === flowId);
    if (!graph) {
      sendJson(response, 404, { error: "flow_not_found", flow_id: flowId });
      return true;
    }
    const media = client
      ? await resolveFlowScreenMedia(client, graph.screens)
      : {};
    sendJson(response, 200, getFlowInteractiveEnvelope(graph, media));
    return true;
  }

  const flowDetail = path.match(/^\/flows\/([^/]+)$/);
  if (request.method === "GET" && flowDetail) {
    const flowId = decodeURIComponent(flowDetail[1] ?? "");
    const {
      loadFlowLibraryGraphs,
      getFlowDetailEnvelope,
      resolveFlowScreenMedia
    } = await import("./flow-library.js");
    const graphs = await loadFlowLibraryGraphs();
    const graph = graphs.find((item) => item.flow_id === flowId);
    if (!graph) {
      sendJson(response, 404, { error: "flow_not_found", flow_id: flowId });
      return true;
    }
    const media = client
      ? await resolveFlowScreenMedia(client, graph.screens)
      : {};
    sendJson(response, 200, getFlowDetailEnvelope(graph, media));
    return true;
  }

  if (!client) {
    sendJson(response, 503, {
      error: "database_unavailable",
      message: "Postgres is not configured or not reachable"
    });
    return true;
  }

  if (request.method === "GET" && path === "/captures") {
    const platformProjectId = queryParam(requestUrl, "platformProjectId") ?? queryParam(requestUrl, "platform_project_id");
    const digProjectId = queryParam(requestUrl, "digProjectId") ?? queryParam(requestUrl, "dig_project_id");
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (platformProjectId) {
      values.push(platformProjectId);
      clauses.push(`platform_project_id = $${values.length}`);
    }
    if (digProjectId) {
      values.push(digProjectId);
      clauses.push(`dig_project_id = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `SELECT capture_run_id, package_path, requested_url, canonical_url, status, site_domain, page_route,
              quality_overall, quality_rating, started_at, completed_at, indexed_at,
              dig_project_id, platform_project_id
       FROM captures
       ${where}
       ORDER BY indexed_at DESC
       LIMIT 100`,
      values
    );
    sendJson(response, 200, { captures: result.rows });
    return true;
  }

  if (request.method === "GET" && path === "/sections") {
    const category = queryParam(requestUrl, "category");
    const signature = queryParam(requestUrl, "signature");
    const q = queryParam(requestUrl, "q");
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (category) {
      values.push(category);
      clauses.push(`category = $${values.length}`);
    }
    if (signature) {
      values.push(signature);
      clauses.push(`signature = $${values.length}`);
    }
    if (q) {
      values.push(`%${q.toLocaleLowerCase()}%`);
      clauses.push(
        `(LOWER(taxonomy_id) LIKE $${values.length} OR LOWER(signature) LIKE $${values.length} OR LOWER(text_signals::text) LIKE $${values.length})`
      );
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `SELECT id, capture_run_id, viewport_name, section_id, taxonomy_id, category, signature,
              confidence, method, recipe, text_signals, root_box, viewport_width, viewport_height
       FROM sections
       ${where}
       ORDER BY confidence DESC, id DESC
       LIMIT 200`,
      values
    );
    sendJson(response, 200, { sections: result.rows });
    return true;
  }

  if (request.method === "GET" && path === "/screens") {
    const result = await client.query(
      `SELECT v.id, v.capture_run_id, v.viewport_capture_id, v.name, v.status, v.width, v.height,
              v.document_width, v.document_height,
              v.title, v.settled_screenshot_path, v.full_page_screenshot_path,
              c.canonical_url, c.site_domain, c.package_path
       FROM viewports v
       JOIN captures c ON c.capture_run_id = v.capture_run_id
       ORDER BY c.indexed_at DESC, v.name
       LIMIT 200`
    );
    sendJson(response, 200, {
      screens: result.rows.map((row) => {
        const captureRunId = String(row.capture_run_id ?? "");
        return {
          ...row,
          ...screenMediaUrls(base, captureRunId, row)
        };
      })
    });
    return true;
  }

  const screenDetail = path.match(/^\/screens\/([^/]+)$/);
  if (request.method === "GET" && screenDetail) {
    const viewportCaptureId = decodeURIComponent(screenDetail[1]!);
    const screen = await client.query(
      `SELECT v.id, v.capture_run_id, v.viewport_capture_id, v.name, v.status, v.width, v.height,
              v.document_width, v.document_height,
              v.title, v.settled_screenshot_path, v.full_page_screenshot_path,
              c.canonical_url, c.site_domain, c.package_path
       FROM viewports v
       JOIN captures c ON c.capture_run_id = v.capture_run_id
       WHERE v.viewport_capture_id = $1
       LIMIT 1`,
      [viewportCaptureId]
    );
    const row = screen.rows[0];
    if (!row) {
      sendJson(response, 404, { error: "screen_not_found" });
      return true;
    }
    const captureRunId = String(row.capture_run_id ?? "");
    const docW =
      typeof row.document_width === "number"
        ? row.document_width
        : Number(row.document_width) || Number(row.width) || null;
    let docH =
      typeof row.document_height === "number"
        ? row.document_height
        : Number(row.document_height) || Number(row.height) || null;
    let visionLayout: Awaited<ReturnType<typeof loadVisionLayoutDocument>> = null;
    const packagePath = typeof row.package_path === "string" ? row.package_path : null;
    if (packagePath) {
      visionLayout = await loadVisionLayoutDocument(packagePath).catch(() => null);
    }
    if ((!docH || !Number.isFinite(docH)) && visionLayout?.image_height) {
      docH = visionLayout.image_height;
    }
    const hotspots =
      visionLayout?.status === "complete" && visionLayout.bands.length
        ? visionLayout.bands.map((band) => ({
            section_id: band.id,
            label: `${band.category} · ${band.label}`,
            role: "section",
            box: {
              x: band.box.x * (docW || visionLayout!.image_width || 1),
              y: band.box.y * (docH || visionLayout!.image_height || 1),
              width: band.box.width * (docW || visionLayout!.image_width || 1),
              height: band.box.height * (docH || visionLayout!.image_height || 1)
            },
            normalized: band.box
          }))
        : [];
    sendJson(response, 200, {
      screen: {
        ...row,
        document_width: docW,
        document_height: docH,
        ...screenMediaUrls(base, captureRunId, row)
      },
      hotspots,
      sections: [],
      vision_layout: visionLayout
        ? {
            status: visionLayout.status,
            band_count: visionLayout.bands.length,
            notes: visionLayout.notes ?? null,
            source_screenshot: visionLayout.source_screenshot,
            bands: visionLayout.bands,
            ...(visionLayout.error ? { error: visionLayout.error } : {})
          }
        : null
    });
    return true;
  }

  if (request.method === "GET" && (path === "/page-flows" || (path === "/flows" && queryParam(requestUrl, "capture_run_id")))) {
    const captureRunId = queryParam(requestUrl, "capture_run_id");
    if (!captureRunId) {
      sendJson(response, 400, { error: "capture_run_id is required" });
      return true;
    }
    const flow = await client.query(
      `SELECT id, section_label, signature, step_index, evidence_refs
       FROM llm_items
       WHERE capture_run_id = $1 AND kind = 'page_flow'
       ORDER BY step_index ASC NULLS LAST, id ASC`,
      [captureRunId]
    );
    const sections = await client.query(
      `SELECT section_id, category, signature, taxonomy_id, confidence, viewport_name
       FROM sections
       WHERE capture_run_id = $1
       ORDER BY id ASC`,
      [captureRunId]
    );
    sendJson(response, 200, {
      capture_run_id: captureRunId,
      steps: flow.rows.map((step) => {
        const signature = typeof step.signature === "string" ? step.signature : null;
        const match = sections.rows.find((section) => section.signature === signature) ?? null;
        return {
          ...step,
          matched_section: match
        };
      })
    });
    return true;
  }

  if (request.method === "GET" && path === "/ui-elements") {
    const result = await client.query(
      `SELECT name, COUNT(*)::int AS count, AVG(confidence) AS avg_confidence
       FROM llm_items
       WHERE kind = 'ui_element' AND name IS NOT NULL
       GROUP BY name
       ORDER BY count DESC, name ASC
       LIMIT 100`
    );
    sendJson(response, 200, { ui_elements: result.rows });
    return true;
  }

  if (request.method === "GET" && path === "/analyses") {
    const result = await client.query(
      `SELECT a.capture_run_id, a.model, a.status, a.analysis_mode, a.design_summary,
              a.hypothesis_count, a.generated_at, a.raw_response_sha256,
              c.site_domain, c.canonical_url, c.package_path
       FROM llm_analyses a
       JOIN captures c ON c.capture_run_id = a.capture_run_id
       ORDER BY COALESCE(a.generated_at, c.indexed_at) DESC
       LIMIT 100`
    );
    sendJson(response, 200, { analyses: result.rows });
    return true;
  }

  const analysisDetail = path.match(/^\/analyses\/([^/]+)$/);
  if (request.method === "GET" && analysisDetail) {
    const captureRunId = decodeURIComponent(analysisDetail[1]!);
    const analysis = await client.query(
      `SELECT a.capture_run_id, a.model, a.base_url, a.status, a.analysis_mode, a.design_summary,
              a.hypothesis_count, a.generated_at, a.raw_response_sha256,
              c.site_domain, c.canonical_url, c.package_path
       FROM llm_analyses a
       JOIN captures c ON c.capture_run_id = a.capture_run_id
       WHERE a.capture_run_id = $1
       LIMIT 1`,
      [captureRunId]
    );
    const row = analysis.rows[0];
    if (!row) {
      sendJson(response, 404, { error: "analysis_not_found" });
      return true;
    }
    const items = await client.query(
      `SELECT id, kind, name, signature, category, interpretation, section_label, step_index,
              confidence, evidence_refs, gaps
       FROM llm_items
       WHERE capture_run_id = $1
       ORDER BY kind ASC, step_index ASC NULLS LAST, id ASC`,
      [captureRunId]
    );
    const withCropUrls = items.rows.map((item) => {
      if (item.kind !== "section_look") return item;
      const gaps = item.gaps && typeof item.gaps === "object" ? (item.gaps as Record<string, unknown>) : {};
      const cropPath = typeof gaps.crop_path === "string" ? gaps.crop_path : null;
      const crop_url = mediaUrl(base, captureRunId, cropPath);
      return { ...item, crop_path: cropPath, crop_url };
    });
    const grouped = {
      screen_patterns: withCropUrls.filter((item) => item.kind === "screen_pattern"),
      ui_elements: withCropUrls.filter((item) => item.kind === "ui_element"),
      recipe_insights: withCropUrls.filter((item) => item.kind === "recipe_insight"),
      page_flow: withCropUrls.filter((item) => item.kind === "page_flow"),
      visual_style: withCropUrls.filter((item) => item.kind === "visual_style"),
      section_look: withCropUrls.filter((item) => item.kind === "section_look")
    };
    let packageExtras: Record<string, unknown> | null = null;
    const packagePath = typeof row.package_path === "string" ? row.package_path : null;
    if (packagePath) {
      try {
        let llm: {
          vision?: unknown;
          cost?: unknown;
          stages?: unknown;
          hypotheses?: unknown;
          mobbin?: { section_descriptions?: unknown };
        } = {};
        try {
          llm = JSON.parse(await readFile(resolve(packagePath, "derived/llm-design.json"), "utf8")) as typeof llm;
        } catch {
          llm = {};
        }
        let section_crops: unknown = null;
        try {
          section_crops = JSON.parse(await readFile(resolve(packagePath, "derived/section-crops.json"), "utf8"));
        } catch {
          section_crops = null;
        }
        // Fill missing crop_urls from package index (pre-LLM crops / older rows).
        if (section_crops && typeof section_crops === "object") {
          const crops = (section_crops as { crops?: Array<{ section_id?: string; path?: string; signature?: string; category?: string }> }).crops ?? [];
          const byId = new Map(crops.map((crop) => [crop.section_id, crop.path]));
          const bySig = new Map(
            crops
              .filter((crop) => crop.signature)
              .map((crop) => [`${crop.category ?? ""}|${crop.signature}`, crop.path])
          );
          grouped.section_look = grouped.section_look.map((item) => {
            if (item.crop_url) return item;
            const pathFromPackage =
              byId.get(String(item.name ?? "")) ??
              bySig.get(`${item.category ?? ""}|${item.signature ?? ""}`) ??
              null;
            if (!pathFromPackage || typeof pathFromPackage !== "string") return item;
            return {
              ...item,
              crop_path: pathFromPackage,
              crop_url: mediaUrl(base, captureRunId, pathFromPackage)
            };
          });
        }
        const visionPage = await loadVisionPageDocument(packagePath).catch(() => null);
        const visionLayout = await loadVisionLayoutDocument(packagePath).catch(() => null);
        const tokens = await loadDesignTokensDocument(packagePath).catch(() => null);
        const screenPatternLabels = grouped.screen_patterns
          .map((item) => String((item as { name?: unknown }).name ?? "").trim())
          .filter(Boolean);
        const visualStyleLabels = grouped.visual_style
          .map((item) => String((item as { name?: unknown }).name ?? "").trim())
          .filter(Boolean);
        const design_facets = buildDesignFacets({
          vision_page: visionPage,
          bands: visionLayout?.bands ?? [],
          screen_pattern_labels: screenPatternLabels,
          visual_style_labels: visualStyleLabels,
          tokens
        });
        packageExtras = {
          vision: llm.vision ?? null,
          cost: llm.cost ?? null,
          stages: llm.stages ?? null,
          hypotheses: llm.hypotheses ?? null,
          section_descriptions: llm.mobbin?.section_descriptions ?? null,
          section_crops,
          vision_page: visionPage,
          vision_layout: visionLayout
            ? {
                status: visionLayout.status,
                band_count: visionLayout.bands.length,
                notes: visionLayout.notes ?? null,
                source_screenshot: visionLayout.source_screenshot,
                bands: visionLayout.bands
              }
            : null,
          design_facets
        };
      } catch {
        packageExtras = null;
      }
    }
    sendJson(response, 200, {
      analysis: row,
      items: grouped,
      package: packageExtras
    });
    return true;
  }

  if (request.method === "GET" && path === "/collections") {
    const result = await client.query(
      `SELECT c.id, c.name, c.created_at,
              COALESCE(COUNT(cc.capture_run_id), 0)::int AS capture_count
       FROM collections c
       LEFT JOIN collection_captures cc ON cc.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    sendJson(response, 200, { collections: result.rows });
    return true;
  }

  if (request.method === "POST" && path === "/collections") {
    const body = await readJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      sendJson(response, 400, { error: "name is required" });
      return true;
    }
    const id = createId("col");
    await client.query(`INSERT INTO collections (id, name) VALUES ($1, $2)`, [id, name]);
    sendJson(response, 201, { id, name });
    return true;
  }

  const collectionCaptures = path.match(/^\/collections\/([^/]+)\/captures$/);
  if (collectionCaptures && (request.method === "POST" || request.method === "DELETE")) {
    const collectionId = decodeURIComponent(collectionCaptures[1]!);
    const body = await readJsonBody(request);
    const captureRunId = typeof body.capture_run_id === "string" ? body.capture_run_id.trim() : "";
    if (!captureRunId) {
      sendJson(response, 400, { error: "capture_run_id is required" });
      return true;
    }
    if (request.method === "POST") {
      await client.query(
        `INSERT INTO collection_captures (collection_id, capture_run_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [collectionId, captureRunId]
      );
      sendJson(response, 201, { collection_id: collectionId, capture_run_id: captureRunId });
      return true;
    }
    await client.query(
      `DELETE FROM collection_captures WHERE collection_id = $1 AND capture_run_id = $2`,
      [collectionId, captureRunId]
    );
    sendJson(response, 200, { removed: true });
    return true;
  }

  const collectionDetail = path.match(/^\/collections\/([^/]+)$/);
  if (request.method === "GET" && collectionDetail) {
    const collectionId = decodeURIComponent(collectionDetail[1]!);
    const collection = await client.query(`SELECT id, name, created_at FROM collections WHERE id = $1`, [collectionId]);
    if (!collection.rows[0]) {
      sendJson(response, 404, { error: "collection_not_found" });
      return true;
    }
    const members = await client.query(
      `SELECT cc.capture_run_id, cc.added_at, c.site_domain, c.canonical_url
       FROM collection_captures cc
       JOIN captures c ON c.capture_run_id = cc.capture_run_id
       WHERE cc.collection_id = $1
       ORDER BY cc.added_at DESC`,
      [collectionId]
    );
    sendJson(response, 200, { collection: collection.rows[0], captures: members.rows });
    return true;
  }

  if (request.method === "GET" && path === "/search") {
    const q = queryParam(requestUrl, "q");
    if (!q) {
      sendJson(response, 400, { error: "q is required" });
      return true;
    }
    const limit = Number(queryParam(requestUrl, "limit") ?? "20");
    try {
      const results = await searchEmbeddings(client, q, Number.isFinite(limit) ? limit : 20);
      sendJson(response, 200, { query: q, results });
    } catch (error) {
      sendJson(response, 503, {
        error: "vector_search_unavailable",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "GET" && path === "/nodes") {
    const taxonomyId = queryParam(requestUrl, "taxonomy_id");
    const q = queryParam(requestUrl, "q");
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (taxonomyId) {
      values.push(taxonomyId);
      clauses.push(`taxonomy_id = $${values.length}`);
    }
    if (q) {
      values.push(`%${q.toLocaleLowerCase()}%`);
      clauses.push(
        `(LOWER(label) LIKE $${values.length} OR LOWER(taxonomy_id) LIKE $${values.length} OR LOWER(COALESCE(text_preview, '')) LIKE $${values.length})`
      );
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await client.query(
      `SELECT id, capture_run_id, viewport_capture_id, ontology_entity_id, node_id,
              taxonomy_id, label, entity_type, text_preview, confidence, box
       FROM design_nodes
       ${where}
       ORDER BY confidence DESC NULLS LAST, id DESC
       LIMIT 200`,
      values
    );
    sendJson(response, 200, { nodes: result.rows });
    return true;
  }

  if (request.method === "GET" && path === "/export/figma") {
    const captureRunId = queryParam(requestUrl, "capture_run_id");
    if (!captureRunId) {
      sendJson(response, 400, { error: "capture_run_id is required" });
      return true;
    }
    const capture = await client.query(
      "SELECT package_path FROM captures WHERE capture_run_id = $1",
      [captureRunId]
    );
    const packagePath = (capture.rows[0] as { package_path?: string } | undefined)?.package_path;
    if (!packagePath) {
      sendJson(response, 404, { error: "capture_not_found" });
      return true;
    }
    try {
      const manifest = JSON.parse(await readFile(resolve(packagePath, "manifest.json"), "utf8")) as CaptureManifest;
      let sections: SectionCompositionDocument | null = null;
      try {
        const sectionPath = manifest.run_artifacts.section_compositions?.path ?? "derived/section-compositions.json";
        sections = JSON.parse(await readFile(resolve(packagePath, sectionPath), "utf8")) as SectionCompositionDocument;
      } catch {
        sections = null;
      }
      const flow = await client.query(
        `SELECT section_label, signature, step_index
         FROM llm_items
         WHERE capture_run_id = $1 AND kind = 'page_flow'
         ORDER BY step_index ASC NULLS LAST, id ASC`,
        [captureRunId]
      );
      const flowLabels = flow.rows.map((row) => {
        const label = typeof row.section_label === "string" ? row.section_label : "step";
        const signature = typeof row.signature === "string" ? row.signature : "";
        return signature ? `${label} (${signature})` : label;
      });
      const document = buildFigmaExport({ manifest, sections, flowLabels });
      sendJson(response, 200, document);
    } catch (error) {
      sendJson(response, 500, {
        error: "figma_export_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "GET" && path === "/media") {
    const captureRunId = queryParam(requestUrl, "capture_run_id");
    const relativePath = queryParam(requestUrl, "path");
    if (!captureRunId || !relativePath) {
      sendJson(response, 400, { error: "capture_run_id and path are required" });
      return true;
    }
    const capture = await client.query("SELECT package_path FROM captures WHERE capture_run_id = $1", [captureRunId]);
    const packagePath = (capture.rows[0] as { package_path?: string } | undefined)?.package_path;
    if (!packagePath) {
      sendJson(response, 404, { error: "capture_not_found" });
      return true;
    }
    const absolute = resolve(packagePath, relativePath);
    if (!absolute.startsWith(resolve(packagePath)) || !existsSync(absolute) || !statSync(absolute).isFile()) {
      sendJson(response, 404, { error: "media_not_found" });
      return true;
    }
    const ext = extname(absolute).toLowerCase();
    const type =
      ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "public, max-age=3600" });
    createReadStream(absolute).pipe(response);
    return true;
  }

  if (request.method === "GET" && path === "/references") {
    try {
      const { searchDesignReferences } = await import("./design-reference-library.js");
      const references = await searchDesignReferences({
        query: queryParam(requestUrl, "q") ?? queryParam(requestUrl, "query") ?? undefined,
        category: queryParam(requestUrl, "category") ?? undefined,
        signature: queryParam(requestUrl, "signature") ?? undefined,
        style_label: queryParam(requestUrl, "style_label") ?? undefined,
        similar_to: queryParam(requestUrl, "similar_to") ?? queryParam(requestUrl, "similarTo") ?? undefined,
        platformProjectId:
          queryParam(requestUrl, "platformProjectId") ?? queryParam(requestUrl, "platform_project_id"),
        digProjectId: queryParam(requestUrl, "digProjectId") ?? queryParam(requestUrl, "dig_project_id"),
        limit: Number(queryParam(requestUrl, "limit") ?? 20)
      });
      sendJson(response, 200, { references, count: references.length });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("platformProjectId required") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  const referenceMatch = path.match(/^\/references\/([^/]+)$/);
  if (request.method === "GET" && referenceMatch) {
    try {
      const { getDesignReference } = await import("./design-reference-library.js");
      const referenceId = decodeURIComponent(referenceMatch[1]!);
      const reference = await getDesignReference(referenceId, {
        platformProjectId:
          queryParam(requestUrl, "platformProjectId") ?? queryParam(requestUrl, "platform_project_id")
      });
      if (!reference) {
        sendJson(response, 404, { error: "not_found" });
        return true;
      }
      sendJson(response, 200, { reference });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("platformProjectId required") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  if (request.method === "POST" && path === "/references/pack") {
    try {
      const body = await readJsonBody(request);
      const { assembleDesignReferencePack } = await import("./design-reference-library.js");
      const referenceIds = Array.isArray(body.reference_ids)
        ? body.reference_ids.filter((id): id is string => typeof id === "string")
        : Array.isArray(body.referenceIds)
          ? body.referenceIds.filter((id): id is string => typeof id === "string")
          : [];
      const pack = await assembleDesignReferencePack({
        intent: typeof body.intent === "string" ? body.intent : "",
        reference_ids: referenceIds,
        synthesis_mode: body.synthesis_mode === "look_conditioned" ? "look_conditioned" : "structural",
        platformProjectId:
          typeof body.platformProjectId === "string"
            ? body.platformProjectId
            : typeof body.platform_project_id === "string"
              ? body.platform_project_id
              : null
      });
      sendJson(response, 200, pack);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes("required") || message.includes("Unknown reference") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  if (request.method === "POST" && path === "/references/prompt-pack") {
    try {
      const body = await readJsonBody(request);
      const { assembleDesignReferencePack } = await import("./design-reference-library.js");
      const { assembleDesignPromptPack } = await import("./design-prompt-pack.js");
      const referenceIds = Array.isArray(body.reference_ids)
        ? body.reference_ids.filter((id): id is string => typeof id === "string")
        : Array.isArray(body.referenceIds)
          ? body.referenceIds.filter((id): id is string => typeof id === "string")
          : [];
      const pack = await assembleDesignReferencePack({
        intent: typeof body.intent === "string" ? body.intent : typeof body.brief === "string" ? body.brief : "",
        reference_ids: referenceIds,
        synthesis_mode: body.synthesis_mode === "look_conditioned" ? "look_conditioned" : "structural",
        platformProjectId:
          typeof body.platformProjectId === "string"
            ? body.platformProjectId
            : typeof body.platform_project_id === "string"
              ? body.platform_project_id
              : null
      });
      const brief =
        typeof body.brief === "string" && body.brief.trim()
          ? body.brief.trim()
          : pack.intent;
      const output_contract =
        body.output_contract === "prose_brief" || body.output_contract === "both"
          ? body.output_contract
          : "layout_hints_json";
      const look_contract = asLookContract(body.look_contract);
      let tokens: DesignTokensDocument | null = null;
      const captureRunId = pack.references[0]?.capture_run_id;
      if (captureRunId && !look_contract) {
        const capture = await client.query(
          "SELECT package_path FROM captures WHERE capture_run_id = $1 LIMIT 1",
          [captureRunId]
        );
        const packagePath = (capture.rows[0] as { package_path?: string } | undefined)?.package_path;
        if (packagePath) tokens = await loadDesignTokensDocument(packagePath).catch(() => null);
      }
      const promptPack = assembleDesignPromptPack({
        brief,
        pack,
        output_contract,
        ...(look_contract ? { look_contract } : {}),
        tokens,
        layout: typeof body.layout === "string" ? body.layout : null,
        style: typeof body.style === "string" ? body.style : null,
        spacing_feel: typeof body.spacing_feel === "string" ? body.spacing_feel : null
      });
      sendJson(response, 200, promptPack);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes("required") || message.includes("Unknown reference") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  if (request.method === "POST" && path === "/references/generate") {
    try {
      const body = await readJsonBody(request);
      const { assembleDesignReferencePack } = await import("./design-reference-library.js");
      const { deriveLayoutFromReferencePack } = await import("./layout-generation.js");
      const referenceIds = Array.isArray(body.reference_ids)
        ? body.reference_ids.filter((id): id is string => typeof id === "string")
        : Array.isArray(body.referenceIds)
          ? body.referenceIds.filter((id): id is string => typeof id === "string")
          : [];
      const pack = await assembleDesignReferencePack({
        intent: typeof body.intent === "string" ? body.intent : "",
        reference_ids: referenceIds,
        synthesis_mode: "look_conditioned",
        platformProjectId:
          typeof body.platformProjectId === "string"
            ? body.platformProjectId
            : typeof body.platform_project_id === "string"
              ? body.platform_project_id
              : null
      });
      const layout_hints =
        body.layout_hints && typeof body.layout_hints === "object"
          ? (body.layout_hints as import("./layout-generation.js").LayoutHints)
          : null;
      const specification = deriveLayoutFromReferencePack({ pack, layout_hints, graph: null });
      sendJson(response, 200, { pack, specification });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes("required") || message.includes("Unknown reference") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  if (request.method === "POST" && path === "/references/reindex") {
    try {
      const body = await readJsonBody(request);
      const captureRunId =
        typeof body.capture_run_id === "string"
          ? body.capture_run_id
          : typeof body.captureRunId === "string"
            ? body.captureRunId
            : null;
      if (!captureRunId) {
        sendJson(response, 400, { error: "capture_run_id required" });
        return true;
      }
      const row = await client.query(
        `SELECT package_path, platform_project_id, dig_project_id FROM captures WHERE capture_run_id = $1 LIMIT 1`,
        [captureRunId]
      );
      const capture = row.rows[0] as
        | {
            package_path?: string;
            platform_project_id?: string | null;
            dig_project_id?: string | null;
          }
        | undefined;
      if (!capture?.package_path) {
        sendJson(response, 404, { error: "capture_not_found" });
        return true;
      }
      const platformProjectId =
        typeof body.platformProjectId === "string"
          ? body.platformProjectId
          : capture.platform_project_id ?? null;
      const { assertCollectionScopeAllowed, indexDesignReferencesFromPackage } = await import(
        "./design-reference-library.js"
      );
      assertCollectionScopeAllowed(platformProjectId);
      const { emitDesignReferencesForPackage } = await import("./design-reference-emit.js");
      const emitted = await emitDesignReferencesForPackage(capture.package_path);
      const indexed = await indexDesignReferencesFromPackage(
        capture.package_path,
        {
          platformProjectId,
          digProjectId: capture.dig_project_id ?? null
        },
        client
      );
      sendJson(response, 200, {
        capture_run_id: captureRunId,
        emitted: emitted.count,
        indexed,
        platform_project_id: platformProjectId
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message.includes("required") || message.includes("not_found") ? 400 : 500;
      sendJson(response, status, { error: message });
    }
    return true;
  }

  sendJson(response, 404, { error: "not_found" });
  return true;
}
