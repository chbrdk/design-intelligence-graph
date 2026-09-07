/**
 * Attach single-screen analysis (SSOT) onto DIG-011 flow screens + flow_context.
 */
import type { Queryable } from "./db.js";
import type { FlowGraphDocument } from "./flow-assemble.js";
import type { FlowDetectScreen } from "./flow-detect.js";

export type FlowScreenAnalysisCompact = {
  capture_run_id: string;
  flow_screen_id: string;
  order: number;
  primary_url: string | null;
  analysis_status: string | null;
  design_summary: string | null;
  screen_patterns: string[];
  visual_style: string[];
  ui_elements: string[];
  flow_context: {
    prev_capture_run_id: string | null;
    next_capture_run_id: string | null;
    prev_url: string | null;
    next_url: string | null;
    outbound_edge_count: number;
    inbound_edge_count: number;
  };
};

function uniqLabels(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

export async function loadFlowScreenAnalyses(
  client: Queryable,
  graph: FlowGraphDocument
): Promise<FlowScreenAnalysisCompact[]> {
  const screens = [...graph.screens].sort((a, b) => a.order - b.order);
  const captureIds = screens.map((screen) => screen.capture_run_id);
  if (!captureIds.length) return [];

  const analysisByCapture = new Map<
    string,
    { status: string | null; design_summary: string | null }
  >();
  const analysisResult = await client.query(
    `SELECT capture_run_id, status, design_summary
     FROM llm_analyses
     WHERE capture_run_id = ANY($1::text[])`,
    [captureIds]
  );
  for (const row of analysisResult.rows as Array<{
    capture_run_id: string;
    status?: string | null;
    design_summary?: string | null;
  }>) {
    analysisByCapture.set(row.capture_run_id, {
      status: row.status ?? null,
      design_summary: row.design_summary ?? null
    });
  }

  const patterns = new Map<string, string[]>();
  const styles = new Map<string, string[]>();
  const elements = new Map<string, string[]>();
  const itemsResult = await client.query(
    `SELECT capture_run_id, kind, name
     FROM llm_items
     WHERE capture_run_id = ANY($1::text[])
       AND kind IN ('screen_pattern', 'visual_style', 'ui_element')
       AND name IS NOT NULL`,
    [captureIds]
  );
  for (const row of itemsResult.rows as Array<{
    capture_run_id: string;
    kind: string;
    name: string;
  }>) {
    const bucket =
      row.kind === "screen_pattern" ? patterns : row.kind === "visual_style" ? styles : elements;
    const list = bucket.get(row.capture_run_id) ?? [];
    list.push(String(row.name));
    bucket.set(row.capture_run_id, list);
  }

  const outbound = new Map<string, number>();
  const inbound = new Map<string, number>();
  for (const edge of graph.edges) {
    outbound.set(edge.from_screen_id, (outbound.get(edge.from_screen_id) ?? 0) + 1);
    inbound.set(edge.to_screen_id, (inbound.get(edge.to_screen_id) ?? 0) + 1);
  }

  return screens.map((screen, index) => {
    const prev = index > 0 ? screens[index - 1]! : null;
    const next = index < screens.length - 1 ? screens[index + 1]! : null;
    const analysis = analysisByCapture.get(screen.capture_run_id);
    return {
      capture_run_id: screen.capture_run_id,
      flow_screen_id: screen.flow_screen_id,
      order: screen.order,
      primary_url: screen.primary_url ?? null,
      analysis_status: analysis?.status ?? null,
      design_summary: analysis?.design_summary ?? null,
      screen_patterns: uniqLabels(patterns.get(screen.capture_run_id) ?? []),
      visual_style: uniqLabels(styles.get(screen.capture_run_id) ?? []),
      ui_elements: uniqLabels(elements.get(screen.capture_run_id) ?? [], 16),
      flow_context: {
        prev_capture_run_id: prev?.capture_run_id ?? null,
        next_capture_run_id: next?.capture_run_id ?? null,
        prev_url: prev?.primary_url ?? null,
        next_url: next?.primary_url ?? null,
        outbound_edge_count: outbound.get(screen.flow_screen_id) ?? 0,
        inbound_edge_count: inbound.get(screen.flow_screen_id) ?? 0
      }
    };
  });
}

/** Build Phase C detect screens including pattern/ui labels from enriched analysis. */
export function flowDetectScreensFromAnalyses(
  analyses: FlowScreenAnalysisCompact[]
): FlowDetectScreen[] {
  return analyses.map((screen) => ({
    order: screen.order,
    url: screen.primary_url || "",
    capture_run_id: screen.capture_run_id,
    screen_patterns: screen.screen_patterns,
    ui_element_labels: screen.ui_elements,
    has_form: screen.ui_elements.some((label) => /form|input|password|email/i.test(label)),
    has_nav: screen.ui_elements.some((label) => /nav|menu|tab/i.test(label))
  }));
}

export function attachAnalysesToFlowDetail(
  detail: { schema_version: "0.1.0"; flow: FlowGraphDocument; media: Record<string, unknown> },
  screenAnalyses: FlowScreenAnalysisCompact[]
) {
  return {
    ...detail,
    screen_analyses: screenAnalyses,
    analysis_coverage: {
      screens: screenAnalyses.length,
      with_summary: screenAnalyses.filter((item) => Boolean(item.design_summary?.trim())).length,
      with_patterns: screenAnalyses.filter((item) => item.screen_patterns.length > 0).length,
      complete_status: screenAnalyses.filter((item) => item.analysis_status === "complete").length
    }
  };
}
