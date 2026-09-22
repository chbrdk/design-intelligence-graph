/**
 * Dribbble OAuth v2 scaffold (official API only — no HTML scrape).
 * Spec: plexon specs/domain/spirion-campaign-motif-corpus.md
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { dribbbleConfig, indexesDirectory, loadDigPaths } from "./runtime-paths.js";

export type DribbbleTokenStore = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  created_at?: number;
  username?: string | null;
  pending_states?: Array<{ state: string; created_at: string }>;
};

const STATE_TTL_MS = 15 * 60 * 1000;

export function dribbbleTokenPath(root = process.cwd()): string {
  return resolve(indexesDirectory(root), dribbbleConfig(root).tokenFile);
}

export function dribbbleRedirectUri(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): string {
  const cfg = dribbbleConfig(root);
  const fromEnv = environment[cfg.redirectUriEnv]?.trim();
  if (fromEnv) return fromEnv;
  const island = loadDigPaths(root).coolify?.digFqdn?.replace(/\/$/, "") ?? "http://127.0.0.1:3010";
  return `${island}${cfg.islandCallbackPath}`;
}

export async function readDribbbleTokens(root = process.cwd()): Promise<DribbbleTokenStore> {
  try {
    return JSON.parse(await readFile(dribbbleTokenPath(root), "utf8")) as DribbbleTokenStore;
  } catch {
    return {};
  }
}

async function writeDribbbleTokens(store: DribbbleTokenStore, root = process.cwd()): Promise<void> {
  const path = dribbbleTokenPath(root);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function pruneStates(store: DribbbleTokenStore, now = Date.now()): DribbbleTokenStore {
  const pending = (store.pending_states ?? []).filter((item) => {
    const created = Date.parse(item.created_at);
    return Number.isFinite(created) && now - created < STATE_TTL_MS;
  });
  return { ...store, pending_states: pending };
}

export function dribbbleClientConfigured(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): boolean {
  const cfg = dribbbleConfig(root);
  return Boolean(environment[cfg.clientIdEnv]?.trim() && environment[cfg.clientSecretEnv]?.trim());
}

export async function dribbbleConnectionStatus(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
) {
  const store = await readDribbbleTokens(root);
  return {
    configured: dribbbleClientConfigured(environment, root),
    connected: Boolean(store.access_token),
    username: store.username ?? null,
    scope: store.scope ?? null,
    policy_version: dribbbleConfig(root).policyVersion
  };
}

export async function createDribbbleAuthorizeUrl(
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<{ authorize_url: string; state: string }> {
  const cfg = dribbbleConfig(root);
  const clientId = environment[cfg.clientIdEnv]?.trim();
  if (!clientId || !environment[cfg.clientSecretEnv]?.trim()) {
    throw new Error(`${cfg.clientIdEnv} and ${cfg.clientSecretEnv} must be set on dig-api`);
  }
  const state = randomBytes(16).toString("hex");
  const store = pruneStates(await readDribbbleTokens(root));
  store.pending_states = [...(store.pending_states ?? []), { state, created_at: new Date().toISOString() }];
  await writeDribbbleTokens(store, root);
  const url = new URL(cfg.oauthAuthorize);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", dribbbleRedirectUri(environment, root));
  url.searchParams.set("scope", cfg.oauthScopes.join(" "));
  url.searchParams.set("state", state);
  return { authorize_url: url.toString(), state };
}

export async function exchangeDribbbleCode(
  code: string,
  state: string,
  environment: NodeJS.ProcessEnv = process.env,
  root = process.cwd()
): Promise<DribbbleTokenStore> {
  const cfg = dribbbleConfig(root);
  const store = pruneStates(await readDribbbleTokens(root));
  const pending = store.pending_states ?? [];
  if (!pending.some((item) => item.state === state)) {
    throw new Error("invalid_oauth_state");
  }
  const clientId = environment[cfg.clientIdEnv]?.trim() ?? "";
  const clientSecret = environment[cfg.clientSecretEnv]?.trim() ?? "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: dribbbleRedirectUri(environment, root)
  });
  const response = await fetch(cfg.oauthToken, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body
  });
  if (!response.ok) {
    throw new Error(`dribbble_token_exchange_failed:${response.status}`);
  }
  const json = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    scope?: string;
    created_at?: number;
  };
  const next: DribbbleTokenStore = {
    ...(json.access_token ? { access_token: json.access_token } : {}),
    ...(json.token_type ? { token_type: json.token_type } : {}),
    ...(json.scope ? { scope: json.scope } : {}),
    ...(typeof json.created_at === "number" ? { created_at: json.created_at } : {}),
    pending_states: []
  };
  await writeDribbbleTokens(next, root);
  return next;
}

export async function connectedDribbbleAccessToken(root = process.cwd()): Promise<string | null> {
  const store = await readDribbbleTokens(root);
  return store.access_token?.trim() || null;
}

export async function saveDribbbleUsername(username: string, root = process.cwd()): Promise<void> {
  const store = await readDribbbleTokens(root);
  store.username = username;
  await writeDribbbleTokens(store, root);
}
