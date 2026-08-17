import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { indexesDirectory, loadDigPaths, pinterestConfig } from "./runtime-paths.js";

export type PinterestTokenStore = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  username?: string | null;
  pending_states?: Array<{ state: string; created_at: string }>;
};

const STATE_TTL_MS = 15 * 60 * 1000;

export function pinterestTokenPath(root = process.cwd()): string {
  return resolve(indexesDirectory(root), pinterestConfig(root).tokenFile);
}

export function pinterestRedirectUri(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): string {
  const cfg = pinterestConfig(root);
  const fromEnv = environment[cfg.redirectUriEnv]?.trim();
  if (fromEnv) return fromEnv;
  const island = loadDigPaths(root).coolify?.digFqdn?.replace(/\/$/, "") ?? "http://127.0.0.1:3010";
  return `${island}${cfg.islandCallbackPath}`;
}

export async function readPinterestTokens(root = process.cwd()): Promise<PinterestTokenStore> {
  try {
    return JSON.parse(await readFile(pinterestTokenPath(root), "utf8")) as PinterestTokenStore;
  } catch {
    return {};
  }
}

async function writePinterestTokens(store: PinterestTokenStore, root = process.cwd()): Promise<void> {
  const path = pinterestTokenPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function pruneStates(store: PinterestTokenStore, now = Date.now()): PinterestTokenStore {
  const pending = (store.pending_states ?? []).filter((item) => {
    const created = Date.parse(item.created_at);
    return Number.isFinite(created) && now - created < STATE_TTL_MS;
  });
  return { ...store, pending_states: pending };
}

export function pinterestClientConfigured(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): boolean {
  const cfg = pinterestConfig(root);
  return Boolean(environment[cfg.clientIdEnv]?.trim() && environment[cfg.clientSecretEnv]?.trim());
}

export async function createPinterestAuthorizeUrl(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<{ authorize_url: string; state: string }> {
  const cfg = pinterestConfig(root);
  const clientId = environment[cfg.clientIdEnv]?.trim();
  if (!clientId || !environment[cfg.clientSecretEnv]?.trim()) {
    throw new Error(`${cfg.clientIdEnv} and ${cfg.clientSecretEnv} must be set on dig-api`);
  }
  const state = randomBytes(16).toString("hex");
  const store = pruneStates(await readPinterestTokens(root));
  store.pending_states = [...(store.pending_states ?? []), { state, created_at: new Date().toISOString() }];
  await writePinterestTokens(store, root);
  const url = new URL(cfg.oauthAuthorize);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", pinterestRedirectUri(environment, root));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.oauthScopes.join(","));
  url.searchParams.set("state", state);
  return { authorize_url: url.toString(), state };
}

async function tokenRequest(
  body: URLSearchParams,
  environment: NodeJS.ProcessEnv,
  root: string
): Promise<PinterestTokenStore> {
  const cfg = pinterestConfig(root);
  const clientId = environment[cfg.clientIdEnv]?.trim() ?? "";
  const clientSecret = environment[cfg.clientSecretEnv]?.trim() ?? "";
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(cfg.oauthToken, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : `Pinterest token HTTP ${response.status}`;
    throw new Error(message);
  }
  const access = typeof payload.access_token === "string" ? payload.access_token : "";
  if (!access) throw new Error("Pinterest token response missing access_token");
  const expiresIn = Number(payload.expires_in);
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;
  const tokens: PinterestTokenStore = { access_token: access };
  if (typeof payload.refresh_token === "string") tokens.refresh_token = payload.refresh_token;
  if (expiresAt) tokens.expires_at = expiresAt;
  return tokens;
}

export async function exchangePinterestCode(
  input: { code: string; state: string },
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<PinterestTokenStore> {
  const store = pruneStates(await readPinterestTokens(root));
  const pending = store.pending_states ?? [];
  if (!pending.some((item) => item.state === input.state)) {
    throw new Error("OAuth state is invalid or expired");
  }
  const tokens = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: pinterestRedirectUri(environment, root)
    }),
    environment,
    root
  );
  const next: PinterestTokenStore = {
    ...tokens,
    username: store.username ?? null,
    pending_states: pending.filter((item) => item.state !== input.state)
  };
  await writePinterestTokens(next, root);
  return next;
}

export async function connectedPinterestAccessToken(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<string | null> {
  const store = await readPinterestTokens(root);
  if (!store.access_token) return null;
  const expires = store.expires_at ? Date.parse(store.expires_at) : NaN;
  const stillFresh = !Number.isFinite(expires) || expires - Date.now() > 60_000;
  if (stillFresh) return store.access_token;
  if (!store.refresh_token) return store.access_token;
  const refreshed = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: store.refresh_token
    }),
    environment,
    root
  );
  await writePinterestTokens(
    {
      ...store,
      ...refreshed,
      refresh_token: refreshed.refresh_token ?? store.refresh_token
    },
    root
  );
  return refreshed.access_token ?? null;
}

export async function pinterestConnectionStatus(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<{ configured: boolean; connected: boolean; username: string | null }> {
  const store = await readPinterestTokens(root);
  return {
    configured: pinterestClientConfigured(environment, root),
    connected: Boolean(store.access_token),
    username: store.username ?? null
  };
}

export async function savePinterestUsername(username: string | null, root = process.cwd()): Promise<void> {
  const store = await readPinterestTokens(root);
  store.username = username;
  await writePinterestTokens(store, root);
}
