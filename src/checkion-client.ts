/**
 * HTTP client for CHECKION v3 — full-page screenshots are DIG's screen SoT.
 * Paths/env keys: knowledge/paths.json → checkionV3
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface CheckionV3Paths {
  repo?: string;
  localClone?: string | null;
  stagingWeb?: string;
  devWebPort?: number;
  apiTokenEnv?: string;
  apiUrlEnv?: string;
  projectIdEnv?: string;
  defaultProjectName?: string;
  defaultProjectDomain?: string;
}

export interface CheckionConfig {
  baseUrl: string;
  token: string | null;
  projectId: string | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  required: boolean;
}

export interface CheckionScanSummary {
  id: string;
  projectId: string;
  mode: string;
  url: string;
  status: string;
  error?: string | null;
  overallScore?: number | null;
  issueCount?: number;
}

export interface CheckionScreenshot {
  scanId: string;
  bytes: Buffer;
  contentType: string;
  width: number | null;
  height: number | null;
}

export class CheckionClientError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "CheckionClientError";
  }
}

function loadCheckionPaths(root = process.cwd()): CheckionV3Paths {
  const raw = JSON.parse(readFileSync(resolve(root, "knowledge/paths.json"), "utf8")) as {
    checkionV3?: CheckionV3Paths;
  };
  return raw.checkionV3 ?? {};
}

export function checkionConfig(environment: NodeJS.ProcessEnv = process.env, root = process.cwd()): CheckionConfig {
  const paths = loadCheckionPaths(root);
  const apiUrlEnv = paths.apiUrlEnv ?? "CHECKION_API_URL";
  const apiTokenEnv = paths.apiTokenEnv ?? "CHECKION_API_TOKEN";
  const projectIdEnv = paths.projectIdEnv ?? "CHECKION_PROJECT_ID";
  const fromEnv = environment[apiUrlEnv]?.trim();
  const port = paths.devWebPort ?? 3007;
  /** Only when CHECKION_API_URL is set — avoids accidental live calls in unit tests. */
  const baseUrl = (fromEnv || "").replace(/\/$/, "");
  const requiredFlag = (environment.DIG_CHECKION_SCREENSHOTS ?? "1").trim().toLowerCase();
  const required = Boolean(baseUrl) && !(requiredFlag === "0" || requiredFlag === "false" || requiredFlag === "off");
  return {
    baseUrl: baseUrl || `http://127.0.0.1:${port}`,
    token: environment[apiTokenEnv]?.trim() || null,
    projectId: environment[projectIdEnv]?.trim() || null,
    pollIntervalMs: Number(environment.CHECKION_POLL_INTERVAL_MS ?? 2000) || 2000,
    pollTimeoutMs: Number(environment.CHECKION_POLL_TIMEOUT_MS ?? 300_000) || 300_000,
    required
  };
}

function isLocalCheckionBase(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Staging/remote CHECKION needs a Bearer token; local can run without Plexon. */
export function checkionPeerReadyReason(config: CheckionConfig = checkionConfig()): string | null {
  if (!config.required) {
    return "CHECKION screenshots disabled (set CHECKION_API_URL + DIG_CHECKION_SCREENSHOTS=1)";
  }
  if (!config.baseUrl) return "CHECKION_API_URL not set";
  if (!config.token && !isLocalCheckionBase(config.baseUrl)) {
    return "CHECKION_API_TOKEN not set (create Bearer in CHECKION Settings → paste into dig-api Coolify env)";
  }
  return null;
}

export function isCheckionConfigured(config: CheckionConfig = checkionConfig()): boolean {
  return checkionPeerReadyReason(config) === null;
}

function authHeaders(config: CheckionConfig, json = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  return headers;
}

async function checkionFetchJson<T>(
  config: CheckionConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    ...authHeaders(config, init.method !== "GET" && init.method !== "HEAD"),
    ...(init.headers as Record<string, string> | undefined)
  };
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error: unknown) {
    throw new CheckionClientError(
      `CHECKION request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new CheckionClientError(
        response.ok ? `CHECKION non-JSON response: ${text.slice(0, 200)}` : `HTTP ${response.status}: ${text.slice(0, 200)}`,
        response.status
      );
    }
  }
  if (!response.ok) {
    const err = data as { error?: string; message?: string; detail?: string };
    throw new CheckionClientError(
      err.detail ?? err.error ?? err.message ?? `HTTP ${response.status}`,
      response.status
    );
  }
  return data as T;
}

/** JPEG SOF0/SOF2 dimensions (CHECKION uses fullPage JPEG q70). */
export function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9 || marker === 0xda) break;
    const size = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (size < 2) break;
    // SOF0 / SOF1 / SOF2
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return { width, height };
    }
    offset += 2 + size;
  }
  return null;
}

export async function listCheckionProjects(config: CheckionConfig = checkionConfig()): Promise<Array<{ id: string; name: string; domain: string }>> {
  const body = await checkionFetchJson<{ items?: Array<{ id: string; name: string; domain: string }> }>(
    config,
    "/api/projects"
  );
  return body.items ?? [];
}

export async function createCheckionProject(
  input: { name: string; domain: string; description?: string },
  config: CheckionConfig = checkionConfig()
): Promise<{ id: string; name: string; domain: string }> {
  return checkionFetchJson(config, "/api/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function ensureCheckionProjectId(
  config: CheckionConfig = checkionConfig(),
  root = process.cwd()
): Promise<string> {
  if (config.projectId) return config.projectId;
  const paths = loadCheckionPaths(root);
  const name = paths.defaultProjectName ?? "DIG";
  const domain = paths.defaultProjectDomain ?? "design-intelligence-graph.local";
  const projects = await listCheckionProjects(config);
  const existing = projects.find((p) => p.name === name || p.domain === domain);
  if (existing) return existing.id;
  const created = await createCheckionProject(
    {
      name,
      domain,
      description: "DIG capture screenshots (CHECKION full-page SoT)"
    },
    config
  );
  return created.id;
}

export async function startCheckionScan(
  input: { projectId: string; url: string; mode?: "single" | "deep"; waitForCompletion?: boolean },
  config: CheckionConfig = checkionConfig()
): Promise<CheckionScanSummary> {
  return checkionFetchJson(config, "/api/scans", {
    method: "POST",
    body: JSON.stringify({
      projectId: input.projectId,
      mode: input.mode ?? "single",
      url: input.url,
      waitForCompletion: input.waitForCompletion === true
    })
  });
}

export async function getCheckionScan(
  scanId: string,
  config: CheckionConfig = checkionConfig()
): Promise<CheckionScanSummary> {
  return checkionFetchJson(config, `/api/scans/${encodeURIComponent(scanId)}`);
}

export async function waitForCheckionScan(
  scanId: string,
  config: CheckionConfig = checkionConfig()
): Promise<CheckionScanSummary> {
  const started = Date.now();
  let scan = await getCheckionScan(scanId, config);
  while (scan.status === "queued" || scan.status === "running") {
    if (Date.now() - started > config.pollTimeoutMs) {
      throw new CheckionClientError(`CHECKION scan timed out after ${config.pollTimeoutMs}ms (${scanId})`);
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    scan = await getCheckionScan(scanId, config);
  }
  if (scan.status !== "completed") {
    throw new CheckionClientError(scan.error ?? `CHECKION scan ${scan.status}`, undefined);
  }
  return scan;
}

export async function downloadCheckionScreenshot(
  scanId: string,
  config: CheckionConfig = checkionConfig()
): Promise<CheckionScreenshot> {
  const url = `${config.baseUrl}/api/scans/${encodeURIComponent(scanId)}/screenshot`;
  let response: Response;
  try {
    response = await fetch(url, { headers: authHeaders(config) });
  } catch (error: unknown) {
    throw new CheckionClientError(
      `CHECKION screenshot download failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!response.ok) {
    throw new CheckionClientError(`CHECKION screenshot HTTP ${response.status}`, response.status);
  }
  const placeholder = response.headers.get("x-screenshot");
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (placeholder === "placeholder" || contentType.includes("svg") || bytes.length < 100) {
    throw new CheckionClientError("CHECKION returned placeholder screenshot (live scan not available)");
  }
  if (!contentType.includes("jpeg") && !(bytes[0] === 0xff && bytes[1] === 0xd8)) {
    throw new CheckionClientError(`CHECKION screenshot unexpected type: ${contentType || "unknown"}`);
  }
  const dims = jpegDimensions(bytes);
  return {
    scanId,
    bytes,
    contentType: contentType.includes("jpeg") ? contentType : "image/jpeg",
    width: dims?.width ?? null,
    height: dims?.height ?? null
  };
}

/** Start single-URL scan, wait, download full-page JPEG. */
export async function captureCheckionFullPage(
  targetUrl: string,
  config: CheckionConfig = checkionConfig(),
  root = process.cwd()
): Promise<CheckionScreenshot & { projectId: string }> {
  const projectId = await ensureCheckionProjectId(config, root);
  const created = await startCheckionScan(
    { projectId, url: targetUrl, mode: "single", waitForCompletion: true },
    config
  );
  const completed =
    created.status === "completed"
      ? created
      : await waitForCheckionScan(created.id, config);
  if (completed.status !== "completed") {
    throw new CheckionClientError(completed.error ?? `CHECKION scan ${completed.status}`);
  }
  const shot = await downloadCheckionScreenshot(completed.id, config);
  return { ...shot, projectId };
}
