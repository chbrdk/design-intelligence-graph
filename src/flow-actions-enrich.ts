/**
 * Optional C2 LLM flow_actions enrichment for assembled flow graphs.
 */
import type { FlowGraphDocument } from "./flow-assemble.js";
import {
  detectFlowActions,
  runFlowActionsLlmStage,
  type FlowActionAssignment,
  type FlowDetectScreen
} from "./flow-detect.js";
import { createLlmProvider, localLlmConfig } from "./llm-provider.js";
import {
  flowDetectScreensFromAnalyses,
  type FlowScreenAnalysisCompact
} from "./flow-screen-enrich.js";

export type FlowActionsEnrichResult = {
  flow_actions: FlowActionAssignment[];
  title?: string;
  rationale?: string;
  l3_status: "complete" | "failed" | "skipped";
  l3_error?: string;
};

export async function enrichFlowActionsC2(
  input: {
    appScopeId: string;
    flowSessionId?: string | null;
    flowId?: string;
    screens: FlowDetectScreen[];
    edgeIds?: string[];
  },
  options: { enabled?: boolean; environment?: NodeJS.ProcessEnv } = {}
): Promise<FlowActionsEnrichResult> {
  const env = options.environment ?? process.env;
  const enabled = options.enabled ?? env.DIG_FLOW_ACTIONS_LLM === "true";
  if (!enabled) {
    const doc = detectFlowActions({
      appScopeId: input.appScopeId,
      ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {}),
      ...(input.flowId ? { flowId: input.flowId } : {}),
      screens: input.screens,
      ...(input.edgeIds ? { edgeIds: input.edgeIds } : {}),
      skipLlm: true
    });
    return {
      flow_actions: doc.flow_actions,
      l3_status: "skipped"
    };
  }

  try {
    const config = localLlmConfig(env);
    const provider = createLlmProvider(env);
    const { raw } = await runFlowActionsLlmStage(provider, input.screens, {
      maxTokens: Math.min(400, config.stageMaxTokens ?? 400),
      model: config.model
    });
    const doc = detectFlowActions({
      appScopeId: input.appScopeId,
      ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {}),
      ...(input.flowId ? { flowId: input.flowId } : {}),
      screens: input.screens,
      ...(input.edgeIds ? { edgeIds: input.edgeIds } : {}),
      llmRaw: raw
    });
    return {
      flow_actions: doc.flow_actions,
      ...(doc.title ? { title: doc.title } : {}),
      ...(doc.rationale ? { rationale: doc.rationale } : {}),
      l3_status: doc.layers.l3_status,
      ...(doc.layers.l3_error ? { l3_error: doc.layers.l3_error } : {})
    };
  } catch (error: unknown) {
    const doc = detectFlowActions({
      appScopeId: input.appScopeId,
      ...(input.flowSessionId !== undefined ? { flowSessionId: input.flowSessionId } : {}),
      ...(input.flowId ? { flowId: input.flowId } : {}),
      screens: input.screens,
      ...(input.edgeIds ? { edgeIds: input.edgeIds } : {}),
      llmError: error instanceof Error ? error.message : String(error)
    });
    return {
      flow_actions: doc.flow_actions,
      l3_status: "failed",
      l3_error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function applyFlowActionsEnrichmentToGraph(
  graph: FlowGraphDocument,
  screenAnalyses: FlowScreenAnalysisCompact[],
  options: { enabled?: boolean; environment?: NodeJS.ProcessEnv } = {}
): Promise<{ graph: FlowGraphDocument; enrich: FlowActionsEnrichResult }> {
  const detectScreens: FlowDetectScreen[] =
    screenAnalyses.length > 0
      ? flowDetectScreensFromAnalyses(screenAnalyses)
      : graph.screens.map((screen, order) => ({
          order: screen.order ?? order,
          url: screen.primary_url || "",
          capture_run_id: screen.capture_run_id
        }));
  const enrich = await enrichFlowActionsC2(
    {
      appScopeId: graph.app_scope_id,
      flowSessionId: graph.flow_session_id,
      flowId: graph.flow_id,
      screens: detectScreens,
      edgeIds: graph.edges.map((edge) => edge.edge_id)
    },
    options
  );
  const next: FlowGraphDocument = {
    ...graph,
    flow_actions: enrich.flow_actions,
    ...(enrich.title ? { title: enrich.title } : {}),
    notes: [graph.notes, `flow_actions_l3=${enrich.l3_status}`].filter(Boolean).join("; ")
  };
  return { graph: next, enrich };
}
