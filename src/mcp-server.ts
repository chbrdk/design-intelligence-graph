#!/usr/bin/env node
import { createInterface } from "node:readline";
import {
  emptyKnowledgeGraph,
  handleMcpMessage,
  loadKnowledgeGraph
} from "./mcp-api.js";

const graphPath = process.argv[2];
const graph = graphPath ? await loadKnowledgeGraph(graphPath) : emptyKnowledgeGraph();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    const request = JSON.parse(line) as {
      id?: string | number | null;
      method?: string;
      params?: Record<string, unknown>;
    };
    const response = await handleMcpMessage(graph, request);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
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
