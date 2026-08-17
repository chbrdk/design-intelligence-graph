#!/usr/bin/env node
import { createInterface } from "node:readline";
import {
  callDigFlowTool,
  callDigLibraryTool,
  callDigReferenceTool,
  callDigTool,
  listDigTools,
  loadKnowledgeGraph,
  toolResult,
  type McpToolName
} from "./mcp-api.js";

const graphPath = process.argv[2];
if (!graphPath) throw new Error("Usage: dig-mcp <graph.json>");
const graph = await loadKnowledgeGraph(graphPath);
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  try {
    const request = JSON.parse(line) as { id?: string | number; method?: string; params?: Record<string, unknown> };
    let result: unknown;
    if (request.method === "initialize") {
      result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "design-intelligence-graph", version: "0.1.0" }
      };
    } else if (request.method === "tools/list") {
      result = { tools: listDigTools() };
    } else if (request.method === "tools/call") {
      const params = request.params ?? {};
      const name = String(params.name) as McpToolName;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (
        name === "dig_reference_search" ||
        name === "dig_reference_get" ||
        name === "dig_reference_pack" ||
        name === "dig_reference_prompt_pack" ||
        name === "dig_generate"
      ) {
        result = toolResult(await callDigReferenceTool(name, args));
      } else if (name === "dig_screen_search" || name === "dig_capture_prompt_pack") {
        result = toolResult(await callDigLibraryTool(name, args));
      } else if (name === "dig_flow_search" || name === "dig_flow_get" || name === "dig_flow_neighbors") {
        result = toolResult(await callDigFlowTool(name, args));
      } else {
        result = toolResult(callDigTool(graph, name, args));
      }
    } else {
      throw new Error(`Unsupported method: ${request.method}`);
    }
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id ?? null, result })}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) }
      })}\n`
    );
  }
}
