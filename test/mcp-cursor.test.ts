import assert from "node:assert/strict";
import test from "node:test";
import { emptyKnowledgeGraph, handleMcpMessage, listDigTools } from "../src/mcp-api.js";
import { callDigLibraryToolHttp } from "../src/mcp-library-http.js";
import { applyCursorMcpDefaults, mcpLibraryToolNames } from "../src/runtime-paths.js";

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
  assert.ok(listDigTools().length >= tools.length);
});

test("callDigLibraryToolHttp searches screens and strips package_path", async () => {
  const fetchImpl: typeof fetch = async (url) => {
    assert.match(String(url), /\/api\/library\/screens\?style=high-energy/);
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
    { style: "high-energy", limit: 5 },
    "https://spirion-api.example",
    fetchImpl
  )) as { count: number; screens: Array<Record<string, unknown>> };
  assert.equal(result.count, 1);
  assert.equal(result.screens[0]?.capture_run_id, "cap_1");
  assert.equal("package_path" in result.screens[0]!, false);
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
});
