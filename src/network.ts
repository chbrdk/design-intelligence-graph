import type { Page, Request } from "playwright";
import { sha256 } from "./io.js";

export const MAX_HASHABLE_RESOURCE_BYTES = 10 * 1024 * 1024;
const HASHABLE_RESOURCE_TYPES = new Set(["stylesheet", "script", "image", "font"]);

export interface NetworkRecord {
  request_id: string;
  url: string;
  method: string;
  resource_type: string;
  started_at: string;
  duration_ms?: number;
  status?: number;
  status_text?: string;
  mime_type?: string;
  from_service_worker?: boolean;
  outcome: "pending" | "complete" | "failed";
  failure?: string;
  body_bytes?: number;
  content_sha256?: string;
  content_hash_status?: "complete" | "skipped_resource_type" | "skipped_size_limit" | "failed";
}

export function shouldHashResource(resourceType: string, contentLength?: number): boolean {
  return HASHABLE_RESOURCE_TYPES.has(resourceType) && (contentLength === undefined || contentLength <= MAX_HASHABLE_RESOURCE_BYTES);
}

export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    const parameterNames = [...url.searchParams.keys()];
    url.search = "";
    for (const key of parameterNames) url.searchParams.append(key, "[redacted]");
    return url.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function attachNetworkRecorder(page: Page): { records: NetworkRecord[]; flush: () => Promise<void> } {
  const records: NetworkRecord[] = [];
  const byRequest = new Map<Request, { record: NetworkRecord; startedMs: number }>();
  const pendingHashTasks = new Set<Promise<void>>();
  let sequence = 0;
  page.on("request", (request) => {
    const entry = {
      record: {
        request_id: `req_${String(++sequence).padStart(8, "0")}`,
        url: sanitizeUrl(request.url()),
        method: request.method(),
        resource_type: request.resourceType(),
        started_at: new Date().toISOString(),
        outcome: "pending" as const
      },
      startedMs: performance.now()
    };
    records.push(entry.record);
    byRequest.set(request, entry);
  });
  page.on("response", (response) => {
    const entry = byRequest.get(response.request());
    if (!entry) return;
    entry.record.status = response.status();
    entry.record.status_text = response.statusText();
    entry.record.mime_type = response.headers()["content-type"]?.split(";", 1)[0] ?? "";
    entry.record.from_service_worker = response.fromServiceWorker();
  });
  page.on("requestfinished", (request) => {
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.record.duration_ms = Number((performance.now() - entry.startedMs).toFixed(3));
    entry.record.outcome = "complete";
    if (!HASHABLE_RESOURCE_TYPES.has(request.resourceType())) {
      entry.record.content_hash_status = "skipped_resource_type";
      return;
    }
    const task = (async () => {
      try {
        const response = await request.response();
        if (!response) throw new Error("Response unavailable");
        const declaredLength = Number(response.headers()["content-length"]);
        if (Number.isFinite(declaredLength) && !shouldHashResource(request.resourceType(), declaredLength)) {
          entry.record.content_hash_status = "skipped_size_limit";
          return;
        }
        const body = await response.body();
        if (body.byteLength > MAX_HASHABLE_RESOURCE_BYTES) {
          entry.record.body_bytes = body.byteLength;
          entry.record.content_hash_status = "skipped_size_limit";
          return;
        }
        entry.record.body_bytes = body.byteLength;
        entry.record.content_sha256 = sha256(body);
        entry.record.content_hash_status = "complete";
      } catch {
        entry.record.content_hash_status = "failed";
      }
    })();
    pendingHashTasks.add(task);
    void task.finally(() => pendingHashTasks.delete(task));
  });
  page.on("requestfailed", (request) => {
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.record.duration_ms = Number((performance.now() - entry.startedMs).toFixed(3));
    entry.record.outcome = "failed";
    entry.record.failure = request.failure()?.errorText ?? "unknown";
  });
  return {
    records,
    flush: async () => { await Promise.all([...pendingHashTasks]); }
  };
}
