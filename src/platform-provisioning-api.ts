import type { IncomingMessage, ServerResponse } from "node:http";
import { getPool } from "./db.js";
import {
  getDigProjectByPlatformId,
  upsertDigProjectByPlatformId,
  type DigProjectRow
} from "./dig-projects.js";
import { loadDigPaths } from "./runtime-paths.js";

const SERVICE_SECRET_HEADER = "X-Service-Secret";
const CONTRACT_HEADER = "X-Plexon-Contract-Version";
const USER_HEADER = "X-Plexon-User-Id";

function federationContract(): string {
  const paths = loadDigPaths() as { plexon?: { federationContract?: string } };
  return paths.plexon?.federationContract ?? "2026-05-plexon-federation-v3";
}

function sendJson(response: ServerResponse, status: number, body: unknown, contract: string): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    [CONTRACT_HEADER]: contract
  });
  response.end(JSON.stringify(body));
}

function isAuthorized(request: IncomingMessage, expectedSecret: string, contract: string): boolean {
  const requestSecret = String(request.headers[SERVICE_SECRET_HEADER.toLowerCase()] ?? "").trim();
  const contractVersion = String(request.headers[CONTRACT_HEADER.toLowerCase()] ?? "").trim();
  return Boolean(
    expectedSecret && requestSecret && requestSecret === expectedSecret && contractVersion === contract
  );
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid payload");
  }
}

function summaryFromRow(row: DigProjectRow, platformProjectId: string) {
  return {
    externalProjectId: row.id,
    platformProjectId,
    name: row.name,
    domain: row.domain,
    status: row.status,
    captureCount: row.capture_count,
    referenceCount: row.reference_count,
    lastActivityAt: row.last_activity_at
  };
}

/**
 * dig-api mirror of island provisioning — durable Postgres SoT.
 * Path: /api/platform/provisioning/projects/:platformProjectId
 */
export async function handlePlatformProvisioningApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  const match = url.pathname.match(/^\/api\/platform\/provisioning\/projects\/([^/]+)\/?$/);
  if (!match) return false;

  const contract = federationContract();
  const secret = process.env.PLEXON_SERVICE_SECRET?.trim() || "";

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
      "access-control-allow-headers": `content-type, ${SERVICE_SECRET_HEADER}, ${CONTRACT_HEADER}, ${USER_HEADER}`
    });
    response.end();
    return true;
  }

  if (!isAuthorized(request, secret, contract)) {
    sendJson(response, 401, { error: "Unauthorized" }, contract);
    return true;
  }

  const platformProjectId = decodeURIComponent(match[1]!).trim();
  if (!platformProjectId) {
    sendJson(response, 400, { error: "platform project id required" }, contract);
    return true;
  }

  if (!getPool()) {
    sendJson(response, 503, { error: "database_unavailable" }, contract);
    return true;
  }

  if (request.method === "GET") {
    const plexonUserId = String(request.headers[USER_HEADER.toLowerCase()] ?? "").trim();
    if (!plexonUserId) {
      sendJson(response, 400, { error: `${USER_HEADER} required` }, contract);
      return true;
    }
    const project = await getDigProjectByPlatformId(platformProjectId);
    if (!project) {
      sendJson(response, 404, { error: "Not found" }, contract);
      return true;
    }
    sendJson(response, 200, summaryFromRow(project, platformProjectId), contract);
    return true;
  }

  if (request.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = await readJson(request);
    } catch {
      sendJson(response, 400, { error: "Invalid payload" }, contract);
      return true;
    }
    if (body.contractVersion !== contract) {
      sendJson(response, 400, { error: "Unsupported contract version" }, contract);
      return true;
    }
    const name = typeof body.name === "string" ? body.name : "";
    const platformCompanyId = typeof body.platformCompanyId === "string" ? body.platformCompanyId : "";
    const ownerUserId = typeof body.ownerUserId === "string" ? body.ownerUserId : "";
    if (!name.trim() || !platformCompanyId.trim() || !ownerUserId.trim()) {
      sendJson(response, 400, { error: "name, platformCompanyId, ownerUserId required" }, contract);
      return true;
    }
    const project = await upsertDigProjectByPlatformId(platformProjectId, {
      name,
      domain: typeof body.domain === "string" || body.domain === null ? (body.domain as string | null) : undefined,
      status: body.status === "archived" ? "archived" : "active",
      ownerPlexonUserId: ownerUserId,
      platformCompanyId
    });
    sendJson(
      response,
      200,
      {
        status: "applied",
        externalProjectId: project.id,
        projectId: project.id,
        platformProjectId,
        details: "DIG project mirror upserted."
      },
      contract
    );
    return true;
  }

  sendJson(response, 405, { error: "Method not allowed" }, contract);
  return true;
}
