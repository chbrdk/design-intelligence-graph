/**
 * Streamable HTTP MCP on dig-api (Coolify). Cursor connects with url, no local process.
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { emptyKnowledgeGraph, handleMcpMessage, type McpJsonRpcRequest } from "./mcp-api.js";
import { mcpHttpPath } from "./runtime-paths.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":
    "content-type, authorization, mcp-session-id, mcp-protocol-version, accept"
};

function isMcpPath(pathname: string, root = process.cwd()): boolean {
  return pathname === mcpHttpPath(root);
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (Buffer.concat(chunks).length > 256_000) throw new Error("Request body too large");
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

export async function handleMcpHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> {
  if (!isMcpPath(url.pathname)) return false;

  const originHeader = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
  if (!originAllowed(originHeader)) {
    response.writeHead(403, { "content-type": "application/json; charset=utf-8", ...CORS });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "invalid origin" } }));
    return true;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS);
    response.end();
    return true;
  }

  if (request.method === "GET" || request.method === "DELETE") {
    response.writeHead(405, { allow: "POST, OPTIONS", ...CORS });
    response.end();
    return true;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST, OPTIONS", ...CORS });
    response.end();
    return true;
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error: unknown) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8", ...CORS });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: error instanceof Error ? error.message : "parse error" }
      })
    );
    return true;
  }

  const rpc = (body && typeof body === "object" ? body : {}) as McpJsonRpcRequest;
  const isNotification = rpc.id === undefined && typeof rpc.method === "string";
  const result = await handleMcpMessage(emptyKnowledgeGraph(), rpc);
  if (isNotification || result === null) {
    response.writeHead(202, CORS);
    response.end();
    return true;
  }

  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...CORS
  });
  response.end(JSON.stringify(result));
  return true;
}
