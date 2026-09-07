#!/usr/bin/env node
/**
 * CLI: seed DIG FlowSession from CHECKION domain scan or manual URL list.
 * Usage:
 *   npm run flow:seed -- --domain-scan-id=ds_xxx --app-scope-id=app_xxx [--enqueue] [--max-urls=12]
 *   npm run flow:seed -- --manual --app-scope-id=app_linear \
 *     --urls=https://linear.app,https://linear.app/login --enqueue
 * Env: CHECKION_API_URL, CHECKION_API_TOKEN; optional DIG_API_URL + DIG_API_TOKEN for --enqueue
 */
import {
  fetchCheckionDomainSeedSession,
  persistFlowSeedSession,
  runManualFlowSeed,
  stableAppScopeFromRootUrl,
  getFlowSeedEnqueueCapture,
  setFlowSeedEnqueueCapture,
  FLOW_SEED_SOURCE_MANUAL,
  type EnqueueCaptureFn
} from "../src/flow-seed.js";
import { checkionConfig } from "../src/checkion-client.js";
import { loadDotEnv } from "../src/load-env.js";

loadDotEnv();

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function remoteEnqueue(): Promise<EnqueueCaptureFn> {
  return async (url) => {
    const base = process.env.DIG_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8787";
    const token = process.env.DIG_API_TOKEN?.trim();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url })
    });
    if (!response.ok) {
      throw new Error(`enqueue capture failed HTTP ${response.status} for ${url}`);
    }
    const body = (await response.json()) as { job_id?: string };
    return { job_id: body.job_id ?? "" };
  };
}

async function main(): Promise<void> {
  const manual = flag("manual");
  const urlsArg = arg("urls");
  const domainScanId = arg("domain-scan-id") ?? arg("domainScanId");
  const maxUrlsRaw = arg("max-urls") ?? arg("maxUrls");
  const maxUrls = maxUrlsRaw ? Number(maxUrlsRaw) : undefined;
  const enqueue = flag("enqueue");

  if (!manual && !domainScanId) {
    console.error("Missing --domain-scan-id or --manual --urls=...");
    process.exit(1);
  }

  let enqueueCapture: EnqueueCaptureFn | undefined;
  if (enqueue) enqueueCapture = await remoteEnqueue();

  const previous = getFlowSeedEnqueueCapture();
  if (enqueueCapture) setFlowSeedEnqueueCapture(enqueueCapture);
  else setFlowSeedEnqueueCapture(null);

  try {
    if (manual || urlsArg) {
      const urls = (urlsArg ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!urls.length) {
        console.error("Missing --urls=url1,url2 for --manual");
        process.exit(1);
      }
      const appScopeId =
        arg("app-scope-id") ??
        arg("appScopeId") ??
        stableAppScopeFromRootUrl(urls[0]!);
      const result = await runManualFlowSeed({
        appScopeId,
        seedSource: FLOW_SEED_SOURCE_MANUAL,
        urls,
        persist: true,
        captures: [],
        ...(maxUrls && Number.isFinite(maxUrls) ? { maxUrls } : {}),
        ...(enqueueCapture ? { enqueueCapture } : { enqueueCapture: async () => undefined }),
        indexLibrary: false
      });
      console.log(
        JSON.stringify(
          {
            seed_source: result.session.seed_source,
            flow_session_id: result.session.flow_session_id,
            app_scope_id: result.session.app_scope_id,
            session_path: result.session_path,
            urls: result.session.urls.map((item) => item.url),
            missing_urls: result.missing_urls,
            enqueued_jobs: result.enqueued_jobs,
            note: "Re-seed via HTTP after captures exist to index Library graph"
          },
          null,
          2
        )
      );
      return;
    }

    const { session: draft } = await fetchCheckionDomainSeedSession({
      domainScanId: domainScanId!,
      appScopeId: "app_pending",
      maxUrls: maxUrls && Number.isFinite(maxUrls) ? maxUrls : undefined
    });

    const appScopeId =
      arg("app-scope-id") ??
      arg("appScopeId") ??
      (draft.root_url ? stableAppScopeFromRootUrl(draft.root_url) : null);
    if (!appScopeId) {
      console.error("Missing --app-scope-id (and domain scan has no rootUrl)");
      process.exit(1);
    }

    const session = { ...draft, app_scope_id: appScopeId };
    const sessionPath = await persistFlowSeedSession(session);

    const enqueued: string[] = [];
    const hook = getFlowSeedEnqueueCapture();
    if (hook) {
      for (const item of session.urls) {
        const result = await hook(item.url);
        if (result && typeof result === "object" && result.job_id) {
          enqueued.push(String(result.job_id));
        }
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          checkion: checkionConfig().apiUrl,
          session_path: sessionPath,
          flow_session_id: session.flow_session_id,
          app_scope_id: session.app_scope_id,
          url_count: session.urls.length,
          enqueued_jobs: enqueued
        },
        null,
        2
      )
    );
  } finally {
    setFlowSeedEnqueueCapture(previous);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
