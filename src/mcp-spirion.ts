/**
 * SPIRION product MCP tools (CHECKION-parity): prefix spirion.*
 * Jobs, enrichment, library/analyses, plus aliases for existing dig_* library/reference/flow tools.
 */
import { getFederationMode } from "./federation-mode.js";
import { requireDigApiRuntime } from "./dig-api-runtime.js";
import { publicJobView, type JobRecord, type JobResult } from "./job-runner.js";
import {
  publicEnrichmentView,
  type EnrichmentJobRecord
} from "./enrichment-queue.js";
import { getEnrichmentJobFromDb, listEnrichmentJobsFromDb } from "./enrichment-store.js";
import { getPool } from "./db.js";
import { loadDigPaths } from "./runtime-paths.js";

export const SPIRION_TOOL_PREFIX = "spirion.";

export type SpirionToolName =
  | "spirion.health"
  | "spirion.jobs_list"
  | "spirion.job_start"
  | "spirion.job_get"
  | "spirion.enrichment_list"
  | "spirion.enrichment_get"
  | "spirion.captures_list"
  | "spirion.analyses_list"
  | "spirion.analysis_get"
  | "spirion.screens_search"
  | "spirion.capture_prompt_pack"
  | "spirion.references_search"
  | "spirion.reference_get"
  | "spirion.reference_pack"
  | "spirion.compose_brief"
  | "spirion.generate"
  | "spirion.flows_search"
  | "spirion.flow_get"
  | "spirion.flow_neighbors";

/** Maps spirion.* aliases onto existing dig_* handlers in mcp-api. */
export const SPIRION_DIG_ALIASES: Record<string, string> = {
  "spirion.screens_search": "dig_screen_search",
  "spirion.capture_prompt_pack": "dig_capture_prompt_pack",
  "spirion.references_search": "dig_reference_search",
  "spirion.reference_get": "dig_reference_get",
  "spirion.reference_pack": "dig_reference_pack",
  "spirion.compose_brief": "dig_compose_brief",
  "spirion.generate": "dig_generate",
  "spirion.flows_search": "dig_flow_search",
  "spirion.flow_get": "dig_flow_get",
  "spirion.flow_neighbors": "dig_flow_neighbors"
};

type ToolDef = { name: SpirionToolName; description: string; inputSchema: Record<string, unknown> };

function str(args: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function omitPaths<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row };
  delete next.package_path;
  delete next.package_root;
  delete next.index_root;
  return next;
}

function mcpJobView(job: JobRecord) {
  const view = publicJobView(job) as Record<string, unknown>;
  if (view.result && typeof view.result === "object") {
    view.result = omitPaths({ ...(view.result as JobResult) });
  }
  return view;
}

function mcpEnrichmentView(job: EnrichmentJobRecord) {
  return omitPaths({ ...publicEnrichmentView(job) } as Record<string, unknown>);
}

export function spirionToolPrefix(root = process.cwd()): string {
  const configured = loadDigPaths(root).mcpSpirion?.prefix;
  return typeof configured === "string" && configured.trim() ? configured : SPIRION_TOOL_PREFIX;
}

export function isSpirionToolName(name: string): name is SpirionToolName {
  return name.startsWith(spirionToolPrefix()) || name.startsWith(SPIRION_TOOL_PREFIX);
}

export function listSpirionTools(): ToolDef[] {
  return [
    {
      name: "spirion.health",
      description: "GET /api/health — SPIRION dig-api liveness and federation mode.",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "spirion.jobs_list",
      description: "GET /api/jobs — in-memory capture jobs (this API process).",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "spirion.job_start",
      description: "POST /api/jobs — start a capture. Poll spirion.job_get.",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          platformProjectId: { type: "string" },
          digProjectId: { type: "string" }
        }
      }
    },
    {
      name: "spirion.job_get",
      description: "GET /api/jobs/:id — capture job status (no event stream).",
      inputSchema: {
        type: "object",
        required: ["job_id"],
        properties: { job_id: { type: "string" } }
      }
    },
    {
      name: "spirion.enrichment_list",
      description: "GET /api/enrichment — LLM enrichment jobs (memory + Postgres).",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "spirion.enrichment_get",
      description: "GET /api/enrichment/:id",
      inputSchema: {
        type: "object",
        required: ["enrichment_job_id"],
        properties: { enrichment_job_id: { type: "string" } }
      }
    },
    {
      name: "spirion.captures_list",
      description: "GET /api/library/captures — indexed captures (no package_path).",
      inputSchema: {
        type: "object",
        properties: {
          platformProjectId: { type: "string" },
          digProjectId: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "spirion.analyses_list",
      description: "GET /api/library/analyses — LLM analysis summaries (no package_path).",
      inputSchema: { type: "object", properties: { limit: { type: "number" } } }
    },
    {
      name: "spirion.analysis_get",
      description: "GET /api/library/analyses/:capture_run_id",
      inputSchema: {
        type: "object",
        required: ["capture_run_id"],
        properties: { capture_run_id: { type: "string" } }
      }
    },
    {
      name: "spirion.screens_search",
      description: "Alias of dig_screen_search — Library screens by style/layout/industry plus craft facets.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string" },
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          modules: { type: "array", items: { type: "string" } },
          craft_tags: { type: "array", items: { type: "string" } },
          imagery_density: { type: "string" },
          type_scale: { type: "string" },
          type_image_mode: { type: "string" },
          contrast_mode: { type: "string" },
          composition_energy: { type: "string" },
          chrome_weight: { type: "string" },
          platformProjectId: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "spirion.capture_prompt_pack",
      description: "Alias of dig_capture_prompt_pack — look_contract + page_rhythm for one capture.",
      inputSchema: {
        type: "object",
        required: ["capture_run_id"],
        properties: {
          capture_run_id: { type: "string" },
          brief: { type: "string" },
          platformProjectId: { type: "string" },
          output_contract: { type: "string", enum: ["layout_hints_json", "prose_brief", "both"] }
        }
      }
    },
    {
      name: "spirion.references_search",
      description: "Alias of dig_reference_search — Collection-scoped DesignReferences.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string" },
          query: { type: "string" },
          category: { type: "string" },
          signature: { type: "string" },
          style: { type: "string" },
          layout: { type: "string" },
          industry: { type: "string" },
          modules: { type: "array", items: { type: "string" } },
          craft_tags: { type: "array", items: { type: "string" } },
          imagery_density: { type: "string" },
          type_scale: { type: "string" },
          type_image_mode: { type: "string" },
          contrast_mode: { type: "string" },
          composition_energy: { type: "string" },
          chrome_weight: { type: "string" },
          similar_to: { type: "string" },
          platformProjectId: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "spirion.reference_get",
      description: "Alias of dig_reference_get.",
      inputSchema: {
        type: "object",
        required: ["reference_id"],
        properties: { reference_id: { type: "string" }, platformProjectId: { type: "string" } }
      }
    },
    {
      name: "spirion.reference_pack",
      description: "Alias of dig_reference_pack.",
      inputSchema: {
        type: "object",
        required: ["intent", "reference_ids"],
        properties: {
          intent: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          platformProjectId: { type: "string" }
        }
      }
    },
    {
      name: "spirion.compose_brief",
      description: "Alias of dig_compose_brief — merge captures/references into one builder brief.",
      inputSchema: {
        type: "object",
        required: ["intent"],
        properties: {
          intent: { type: "string" },
          brief: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          capture_run_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          primary_screen_id: { type: "string" },
          output_contract: { type: "string", enum: ["layout_hints_json", "prose_brief", "both"] },
          platformProjectId: { type: "string" }
        }
      }
    },
    {
      name: "spirion.generate",
      description: "Alias of dig_generate — look-conditioned layout from DesignReferences.",
      inputSchema: {
        type: "object",
        required: ["intent", "reference_ids"],
        properties: {
          intent: { type: "string" },
          reference_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
          platformProjectId: { type: "string" }
        }
      }
    },
    {
      name: "spirion.flows_search",
      description: "Alias of dig_flow_search.",
      inputSchema: {
        type: "object",
        properties: {
          flow_action: { type: "string" },
          app_scope_id: { type: "string" },
          q: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "spirion.flow_get",
      description: "Alias of dig_flow_get.",
      inputSchema: {
        type: "object",
        required: ["flow_id"],
        properties: { flow_id: { type: "string" } }
      }
    },
    {
      name: "spirion.flow_neighbors",
      description: "Alias of dig_flow_neighbors.",
      inputSchema: {
        type: "object",
        required: ["flow_id", "flow_screen_id"],
        properties: { flow_id: { type: "string" }, flow_screen_id: { type: "string" } }
      }
    }
  ];
}

async function listCaptures(args: Record<string, unknown>) {
  const client = getPool();
  if (!client) throw new Error("database_unavailable");
  const platformProjectId = str(args, "platformProjectId", "platform_project_id");
  const digProjectId = str(args, "digProjectId", "dig_project_id");
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(100, Math.floor(args.limit)))
      : 100;
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
  values.push(limit);
  const result = await client.query(
    `SELECT capture_run_id, requested_url, canonical_url, status, site_domain, page_route,
            quality_overall, quality_rating, started_at, completed_at, indexed_at,
            dig_project_id, platform_project_id
     FROM captures
     ${where}
     ORDER BY indexed_at DESC
     LIMIT $${values.length}`,
    values
  );
  return { captures: result.rows };
}

async function listAnalyses(args: Record<string, unknown>) {
  const client = getPool();
  if (!client) throw new Error("database_unavailable");
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(100, Math.floor(args.limit)))
      : 100;
  const result = await client.query(
    `SELECT a.capture_run_id, a.model, a.status, a.analysis_mode, a.design_summary,
            a.hypothesis_count, a.generated_at, a.raw_response_sha256,
            c.site_domain, c.canonical_url
     FROM llm_analyses a
     JOIN captures c ON c.capture_run_id = a.capture_run_id
     ORDER BY COALESCE(a.generated_at, c.indexed_at) DESC
     LIMIT $1`,
    [limit]
  );
  return { analyses: result.rows };
}

async function getAnalysis(captureRunId: string) {
  const client = getPool();
  if (!client) throw new Error("database_unavailable");
  const analysis = await client.query(
    `SELECT a.capture_run_id, a.model, a.base_url, a.status, a.analysis_mode, a.design_summary,
            a.hypothesis_count, a.generated_at, a.raw_response_sha256,
            c.site_domain, c.canonical_url
     FROM llm_analyses a
     JOIN captures c ON c.capture_run_id = a.capture_run_id
     WHERE a.capture_run_id = $1
     LIMIT 1`,
    [captureRunId]
  );
  const row = analysis.rows[0];
  if (!row) throw new Error("analysis_not_found");
  const items = await client.query(
    `SELECT id, kind, name, signature, category, interpretation, section_label, step_index,
            confidence, evidence_refs, gaps
     FROM llm_items
     WHERE capture_run_id = $1
     ORDER BY kind ASC, step_index ASC NULLS LAST, id ASC`,
    [captureRunId]
  );
  return { analysis: row, items: items.rows };
}

export async function callSpirionTool(name: SpirionToolName, args: Record<string, unknown>): Promise<unknown> {
  if (SPIRION_DIG_ALIASES[name]) {
    throw new Error(`Use dig_* handler for alias ${name}`);
  }

  if (name === "spirion.health") {
    return {
      ok: true,
      service: "spirion",
      federation_mode: getFederationMode(),
      auth: "in-process"
    };
  }

  if (name === "spirion.jobs_list") {
    const { runner } = requireDigApiRuntime();
    return { jobs: runner.listJobs().map(mcpJobView) };
  }

  if (name === "spirion.job_start") {
    const url = str(args, "url");
    if (!url) throw new Error("url required");
    const { runner } = requireDigApiRuntime();
    const job = runner.startJob(url, {
      platformProjectId: str(args, "platformProjectId", "platform_project_id") ?? null,
      digProjectId: str(args, "digProjectId", "dig_project_id") ?? null
    });
    return mcpJobView(job);
  }

  if (name === "spirion.job_get") {
    const jobId = str(args, "job_id", "jobId");
    if (!jobId) throw new Error("job_id required");
    const { runner } = requireDigApiRuntime();
    const job = runner.getJob(jobId);
    if (!job) throw new Error("Job not found");
    return mcpJobView(job);
  }

  if (name === "spirion.enrichment_list") {
    const { enrichmentQueue } = requireDigApiRuntime();
    const memory = enrichmentQueue.listJobs();
    const fromDb = await listEnrichmentJobsFromDb(100).catch(() => []);
    const byId = new Map<string, Record<string, unknown>>();
    for (const job of fromDb) byId.set(job.enrichment_job_id, mcpEnrichmentView(job));
    for (const job of memory) byId.set(job.enrichment_job_id, mcpEnrichmentView(job));
    const jobs = [...byId.values()].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
    return { jobs };
  }

  if (name === "spirion.enrichment_get") {
    const id = str(args, "enrichment_job_id", "enrichmentJobId");
    if (!id) throw new Error("enrichment_job_id required");
    const { enrichmentQueue } = requireDigApiRuntime();
    const job = enrichmentQueue.getJob(id) ?? (await getEnrichmentJobFromDb(id).catch(() => null));
    if (!job) throw new Error("Enrichment job not found");
    return mcpEnrichmentView(job);
  }

  if (name === "spirion.captures_list") return listCaptures(args);
  if (name === "spirion.analyses_list") return listAnalyses(args);
  if (name === "spirion.analysis_get") {
    const captureRunId = str(args, "capture_run_id", "captureRunId");
    if (!captureRunId) throw new Error("capture_run_id required");
    return getAnalysis(captureRunId);
  }

  throw new Error(`Unknown SPIRION tool: ${name}`);
}
