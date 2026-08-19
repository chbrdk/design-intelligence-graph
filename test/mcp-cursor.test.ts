import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { emptyKnowledgeGraph, handleMcpMessage, listDigTools } from "../src/mcp-api.js";
import { handleMcpHttp } from "../src/mcp-http.js";
import { callDigLibraryToolHttp } from "../src/mcp-library-http.js";
import {
  applyCursorMcpDefaults,
  cursorMcpRemoteUrl,
  mcpLibraryToolNames
} from "../src/runtime-paths.js";

function mockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";
  const response = {
    writeHead(status: number, nextHeaders?: Record<string, string>) {
      statusCode = status;
      Object.assign(headers, nextHeaders ?? {});
      return response;
    },
    end(payload?: string) {
      body = payload ?? "";
      return response;
    }
  } as unknown as ServerResponse;
  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    }
  };
}

function mockRequest(method: string, body?: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body ?? "")]);
  return Object.assign(stream, {
    method,
    headers: { origin: "https://cursor.com" },
    url: "/mcp"
  }) as IncomingMessage;
}

test("handleMcpMessage initializes, lists tools, ignores notifications", async () => {
  const graph = emptyKnowledgeGraph();
  const init = await handleMcpMessage(graph, { id: 1, method: "initialize", params: {} });
  assert.equal(init?.result && typeof init.result === "object" && "protocolVersion" in init.result, true);
  assert.equal(await handleMcpMessage(graph, { method: "notifications/initialized" }), null);
  const listed = await handleMcpMessage(graph, { id: 2, method: "tools/list" });
  const tools = (listed?.result as { tools: Array<{ name: string }> }).tools;
  const names = mcpLibraryToolNames();
  assert.ok(tools.some((tool) => tool.name === names.screenSearch));
  assert.ok(tools.some((tool) => tool.name === names.capturePromptPack));
  assert.ok(tools.some((tool) => tool.name === names.composeBrief));
  assert.ok(listDigTools().length >= tools.length);
});

test("callDigLibraryToolHttp searches screens and strips package_path", async () => {
  const fetchImpl: typeof fetch = async (url) => {
    assert.match(String(url), /\/api\/library\/screens\?/);
    assert.match(String(url), /style=high-energy/);
    assert.match(String(url), /craft_tags=editorial_type/);
    return new Response(
      JSON.stringify({
        screens: [
          {
            capture_run_id: "cap_1",
            viewport_capture_id: "vpc_1",
            name: "desktop",
            title: "MSQ",
            site_domain: "www.msqpartners.com",
            canonical_url: "https://www.msqpartners.com/",
            package_path: "/data/captures/secret",
            design_facets: { page_type: "home", style: "high-energy", layout: "full-bleed stacks", industry_tags: ["media"] }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const result = (await callDigLibraryToolHttp(
    "dig_screen_search",
    { style: "high-energy", craft_tags: ["editorial_type"], limit: 5 },
    "https://spirion-api.example",
    fetchImpl
  )) as { count: number; screens: Array<Record<string, unknown>> };
  assert.equal(result.count, 1);
  assert.equal(result.screens[0]?.capture_run_id, "cap_1");
  assert.equal("package_path" in result.screens[0]!, false);
});

test("callDigLibraryToolHttp defaults provider=dense when q is set", async () => {
  const fetchImpl: typeof fetch = async (url) => {
    assert.match(String(url), /q=minimal/);
    assert.match(String(url), /provider=dense/);
    return new Response(JSON.stringify({ screens: [], provider: "dense" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const result = (await callDigLibraryToolHttp(
    "dig_screen_search",
    { q: "minimal monochrome" },
    "https://spirion-api.example",
    fetchImpl
  )) as { provider?: string };
  assert.equal(result.provider, "dense");
});

test("callDigLibraryToolHttp posts capture prompt pack", async () => {
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.match(String(url), /\/api\/library\/analyses\/cap_1\/prompt-pack$/);
    assert.equal(init?.method, "POST");
    return new Response(
      JSON.stringify({
        look_contract: { colors: { accent: "#d6d6d6" } },
        page_rhythm: { page_arc: "nav → hero" }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const result = (await callDigLibraryToolHttp(
    "dig_capture_prompt_pack",
    { capture_run_id: "cap_1" },
    "https://spirion-api.example",
    fetchImpl
  )) as { look_contract: { colors: { accent: string } } };
  assert.equal(result.look_contract.colors.accent, "#d6d6d6");
});

test("applyCursorMcpDefaults points at empty graph and staging API", () => {
  const env: NodeJS.ProcessEnv = {};
  const graph = applyCursorMcpDefaults(process.cwd(), env);
  assert.match(graph, /fixtures\/mcp\/empty-graph\.json$/);
  assert.match(String(env.DIG_API_URL), /spirion-api/);
  assert.equal(env.DIG_MCP_HTTP_CLIENT, "1");
});

test("Cursor mcp.json points at Coolify Streamable HTTP URL", () => {
  const config = JSON.parse(readFileSync(resolve(".cursor/mcp.json"), "utf8")) as {
    mcpServers: { spirion: { url?: string; command?: string } };
  };
  assert.equal(config.mcpServers.spirion.url, cursorMcpRemoteUrl());
  assert.equal(config.mcpServers.spirion.command, undefined);
});

test("handleMcpHttp initialize and tools/list over POST JSON", async () => {
  const init = mockResponse();
  const initOk = await handleMcpHttp(
    mockRequest(
      "POST",
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "0" } }
      })
    ),
    init.response,
    new URL("http://127.0.0.1/mcp")
  );
  assert.equal(initOk, true);
  assert.equal(init.statusCode, 200);
  const initBody = JSON.parse(init.body) as { result: { protocolVersion: string; serverInfo: { name: string } } };
  assert.equal(initBody.result.protocolVersion, "2025-11-25");
  assert.equal(initBody.result.serverInfo.name, "spirion");

  const note = mockResponse();
  await handleMcpHttp(
    mockRequest("POST", JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })),
    note.response,
    new URL("http://127.0.0.1/mcp")
  );
  assert.equal(note.statusCode, 202);

  const listed = mockResponse();
  await handleMcpHttp(
    mockRequest("POST", JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
    listed.response,
    new URL("http://127.0.0.1/mcp")
  );
  const tools = (JSON.parse(listed.body) as { result: { tools: Array<{ name: string }> } }).result.tools;
  assert.ok(tools.some((tool) => tool.name === "dig_screen_search"));
  assert.ok(tools.some((tool) => tool.name === "spirion.health"));
  assert.ok(tools.some((tool) => tool.name === "spirion.job_start"));

  const get = mockResponse();
  await handleMcpHttp(mockRequest("GET"), get.response, new URL("http://127.0.0.1/mcp"));
  assert.equal(get.statusCode, 405);
});
