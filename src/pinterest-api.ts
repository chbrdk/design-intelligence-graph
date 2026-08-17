import type { IncomingMessage, ServerResponse } from "node:http";
import { rejectIfDestructiveUnauthorized, rejectIfUnauthorized } from "./api-auth.js";
import { getDigApiRuntime } from "./dig-api-runtime.js";
import {
  fetchPinterestUserAccount,
  listPinterestBoardPins,
  listPinterestBoards
} from "./pinterest-client.js";
import {
  connectedPinterestAccessToken,
  createPinterestAuthorizeUrl,
  exchangePinterestCode,
  pinterestClientConfigured,
  pinterestConnectionStatus,
  pinterestRedirectUri,
  savePinterestUsername
} from "./pinterest-oauth.js";
import { pinterestConfig } from "./runtime-paths.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  response.end(JSON.stringify(body));
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

export async function handlePinterestApi(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<boolean> {
  const prefix = pinterestConfig(root).apiPrefix.replace(/\/$/, "");
  if (!requestUrl.pathname.startsWith(prefix)) return false;
  if (request.method === "OPTIONS") return false;
  const path = requestUrl.pathname.slice(prefix.length) || "/";

  if (request.method === "GET" && (path === "/status" || path === "/")) {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    const status = await pinterestConnectionStatus(environment, root);
    sendJson(response, 200, {
      ...status,
      redirect_uri: pinterestRedirectUri(environment, root),
      scopes: pinterestConfig(root).oauthScopes,
      max_pins: pinterestConfig(root).maxPinsPerImport
    });
    return true;
  }

  if (request.method === "GET" && path === "/oauth/start") {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    if (!pinterestClientConfigured(environment, root)) {
      sendJson(response, 503, {
        error: "pinterest_not_configured",
        message: "Set PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET on dig-api"
      });
      return true;
    }
    try {
      const started = await createPinterestAuthorizeUrl(environment, root);
      sendJson(response, 200, {
        authorize_url: started.authorize_url,
        redirect_uri: pinterestRedirectUri(environment, root)
      });
    } catch (error: unknown) {
      sendJson(response, 500, {
        error: "pinterest_oauth_start_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "POST" && path === "/oauth/exchange") {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    const body = await readJsonBody(request);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const state = typeof body.state === "string" ? body.state.trim() : "";
    if (!code || !state) {
      sendJson(response, 400, { error: "code_and_state_required" });
      return true;
    }
    try {
      await exchangePinterestCode({ code, state }, environment, root);
      const token = await connectedPinterestAccessToken(environment, root);
      if (token) {
        const account = await fetchPinterestUserAccount(token, root).catch(() => ({ username: null }));
        await savePinterestUsername(account.username, root);
      }
      sendJson(response, 200, await pinterestConnectionStatus(environment, root));
    } catch (error: unknown) {
      sendJson(response, 400, {
        error: "pinterest_oauth_exchange_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "GET" && path === "/boards") {
    if (rejectIfUnauthorized(request, response, environment, root)) return true;
    const token = await connectedPinterestAccessToken(environment, root);
    if (!token) {
      sendJson(response, 401, { error: "pinterest_not_connected" });
      return true;
    }
    try {
      const boards = await listPinterestBoards(token, root);
      sendJson(response, 200, { boards });
    } catch (error: unknown) {
      sendJson(response, 502, {
        error: "pinterest_boards_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  if (request.method === "POST" && path === "/import") {
    if (rejectIfDestructiveUnauthorized(request, response, environment, root)) return true;
    const token = await connectedPinterestAccessToken(environment, root);
    if (!token) {
      sendJson(response, 401, { error: "pinterest_not_connected" });
      return true;
    }
    const body = await readJsonBody(request);
    const boardId = typeof body.board_id === "string" ? body.board_id.trim() : "";
    if (!boardId) {
      sendJson(response, 400, { error: "board_id_required" });
      return true;
    }
    const limitRaw = Number(body.limit);
    const limit = Number.isFinite(limitRaw) ? limitRaw : pinterestConfig(root).maxPinsPerImport;
    const platformProjectId =
      typeof body.platformProjectId === "string"
        ? body.platformProjectId
        : typeof body.platform_project_id === "string"
          ? body.platform_project_id
          : null;
    const runtime = getDigApiRuntime();
    if (!runtime) {
      sendJson(response, 503, { error: "jobs_runtime_unavailable" });
      return true;
    }
    try {
      const pins = await listPinterestBoardPins(token, boardId, limit, root);
      const ingestible = pins.filter((pin) => pin.image);
      const skipped = pins.length - ingestible.length;
      const jobs = runtime.runner.startPinterestJobs(
        ingestible.map((pin) => ({
          pin_id: pin.id,
          image_url: pin.image!.url,
          title: pin.title,
          board_id: boardId
        })),
        { platformProjectId }
      );
      sendJson(response, 200, {
        queued: jobs.length,
        skipped_without_image: skipped,
        jobs: jobs.map((job) => ({ job_id: job.job_id, pin_id: job.pinterest_pin?.pin_id, url: job.url }))
      });
    } catch (error: unknown) {
      sendJson(response, 502, {
        error: "pinterest_import_failed",
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return true;
  }

  sendJson(response, 404, { error: "not_found" });
  return true;
}
