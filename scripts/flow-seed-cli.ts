#!/usr/bin/env node
/**
 * CLI: seed DIG FlowSession from CHECKION domain scan overview.
 * Usage:
 *   npm run flow:seed -- --domain-scan-id=ds_xxx --app-scope-id=app_xxx [--enqueue] [--max-urls=12]
 * Env: CHECKION_API_URL, CHECKION_API_TOKEN; optional DIG_API_URL + DIG_API_TOKEN for --enqueue
 */
import {
  fetchCheckionDomainSeedSession,
  persistFlowSeedSession,
  stableAppScopeFromRootUrl,
  getFlowSeedEnqueueCapture,
  setFlowSeedEnqueueCapture,
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

async function main(): Promise<void> {
  const domainScanId = arg("domain-scan-id") ?? arg("domainScanId");
  if (!domainScanId) {
    console.error("Missing --domain-scan-id");
    process.exit(1);
  }
  const maxUrlsRaw = arg("max-urls") ?? arg("maxUrls");
  const maxUrls = maxUrlsRaw ? Number(maxUrlsRaw) : undefined;
  const enqueue = flag("enqueue");

  const { session: draft, overview } = await fetchCheckionDomainSeedSession({
    domainScanId,
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

  let enqueueCapture: EnqueueCaptureFn | undefined;
  if (enqueue) {
    enqueueCapture = async (url) => {
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

  const previous = getFlowSeedEnqueueCapture();
  if (enqueueCapture) setFlowSeedEnqueueCapture(enqueueCapture);
  else setFlowSeedEnqueueCapture(null);

  const enqueued: string[] = [];
  try {
    const hook = getFlowSeedEnqueueCapture();
    if (hook) {
      for (const item of session.urls) {
        const result = await hook(item.url);
        if (result && typeof result === "object" && result.job_id) {
          enqueued.push(String(result.job_id));
        }
      }
    }
  } finally {
    setFlowSeedEnqueueCapture(previous);
  }

  console.log(
    JSON.stringify(
      {
        flow_session_id: session.flow_session_id,
        app_scope_id: session.app_scope_id,
        seed_ref: session.seed_ref,
        root_url: session.root_url ?? overview.scan?.rootUrl ?? null,
        url_count: session.urls.length,
        urls: session.urls.map((item) => item.url),
        enqueued_jobs: enqueued,
        session_path: sessionPath,
        checkion: checkionConfig().baseUrl,
        note: "Match CaptureRuns later via Library POST /flows/seed or edgesFromSeedSession"
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
