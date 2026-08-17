/**
 * Helpers for WAF-blocked viewports (empty node files, verify stubs).
 */
import { createId } from "./io.js";
import type { ViewportDefinition, ViewportResult } from "./types.js";

export const SKIPPED_AFTER_SITE_BLOCK = "skipped_after_site_block";

export function stubSkippedBlockedViewport(
  viewport: ViewportDefinition,
  blocked: ViewportResult
): ViewportResult {
  const now = new Date().toISOString();
  return {
    viewport_capture_id: createId("vpc"),
    name: viewport.name,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      device_scale_factor: viewport.deviceScaleFactor
    },
    document: { width: 0, height: 0 },
    final_url: blocked.final_url,
    title: blocked.title,
    started_at: now,
    completed_at: now,
    status: "blocked",
    node_count: 0,
    visible_node_count: 0,
    text_line_count: 0,
    artifacts: {},
    warnings: [...blocked.warnings, SKIPPED_AFTER_SITE_BLOCK],
    quality: blocked.quality
  };
}
