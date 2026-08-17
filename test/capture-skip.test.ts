import assert from "node:assert/strict";
import test from "node:test";
import { SKIPPED_AFTER_SITE_BLOCK, stubSkippedBlockedViewport } from "../src/capture-skip.js";
import { evaluateQuality, ZERO_QUALITY_METRICS } from "../src/quality.js";
import type { ViewportResult } from "../src/types.js";

function blockedDesktop(): ViewportResult {
  return {
    viewport_capture_id: "vpc_desktop",
    name: "desktop",
    viewport: { width: 1440, height: 900, device_scale_factor: 1 },
    document: { width: 0, height: 0 },
    final_url: "https://www.tesla.com/",
    title: "Access Denied",
    started_at: "2026-08-17T11:46:23.000Z",
    completed_at: "2026-08-17T11:51:00.000Z",
    status: "blocked",
    node_count: 0,
    visible_node_count: 0,
    text_line_count: 0,
    artifacts: {},
    warnings: ["nav_access_denied", "engine_fallback_firefox_blocked"],
    quality: evaluateQuality(ZERO_QUALITY_METRICS)
  };
}

test("stubSkippedBlockedViewport copies wall URL and marks skipped_after_site_block", () => {
  const stub = stubSkippedBlockedViewport(
    { name: "tablet", width: 768, height: 1024, deviceScaleFactor: 2 },
    blockedDesktop()
  );
  assert.equal(stub.status, "blocked");
  assert.equal(stub.name, "tablet");
  assert.deepEqual(stub.viewport, { width: 768, height: 1024, device_scale_factor: 2 });
  assert.equal(stub.final_url, "https://www.tesla.com/");
  assert.equal(stub.title, "Access Denied");
  assert.ok(stub.warnings.includes(SKIPPED_AFTER_SITE_BLOCK));
  assert.ok(stub.warnings.includes("engine_fallback_firefox_blocked"));
  assert.notEqual(stub.viewport_capture_id, "vpc_desktop");
});
