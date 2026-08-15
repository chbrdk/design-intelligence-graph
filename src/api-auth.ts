/**
 * Machine Bearer gate for dig-api when DIG_FEDERATION_MODE=live.
 * Env name: knowledge/paths.json → plexon.digApiTokenEnv (DIG_API_TOKEN).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getFederationMode } from "./federation-mode.js";
import { loadDigPaths } from "./runtime-paths.js";

export function digApiTokenEnvName(root = process.cwd()): string {
  const paths = loadDigPaths(root) as { plexon?: { digApiTokenEnv?: string } };
  return paths.plexon?.digApiTokenEnv ?? "DIG_API_TOKEN";
}

export function configuredDigApiToken(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): string | null {
  const value = environment[digApiTokenEnvName(root)]?.trim();
  return value || null;
}

export function extractBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export type MachineAuthResult =
  | { ok: true; mode: "dummy" | "live"; authenticated: boolean }
  | { ok: false; status: number; error: string };

/** Live mode requires a configured DIG_API_TOKEN Bearer. Dummy stays open. */
export function assertMachineAuth(
  request: IncomingMessage,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): MachineAuthResult {
  const mode = getFederationMode(environment);
  if (mode !== "live") {
    return { ok: true, mode: "dummy", authenticated: false };
  }
  const expected = configuredDigApiToken(environment, root);
  const serviceSecret = environment.PLEXON_SERVICE_SECRET?.trim() || "";
  const presentedBearer = extractBearerToken(request);
  const presentedService =
    typeof request.headers["x-service-secret"] === "string"
      ? request.headers["x-service-secret"].trim()
      : "";

  if (serviceSecret && presentedService && presentedService === serviceSecret) {
    return { ok: true, mode: "live", authenticated: true };
  }
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: `${digApiTokenEnvName(root)} not configured for DIG_FEDERATION_MODE=live`
    };
  }
  if (!presentedBearer || presentedBearer !== expected) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true, mode: "live", authenticated: true };
}

export function sendUnauthorized(
  response: ServerResponse,
  result: Extract<MachineAuthResult, { ok: false }>
): void {
  const payload = JSON.stringify({ error: result.error });
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "www-authenticate": 'Bearer realm="dig-api"'
  });
  response.end(payload);
}

/** Gate live library/reference/generate routes; returns true if response already sent. */
export function rejectIfUnauthorized(
  request: IncomingMessage,
  response: ServerResponse,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): boolean {
  const result = assertMachineAuth(request, environment, root);
  if (result.ok) return false;
  sendUnauthorized(response, result);
  return true;
}
