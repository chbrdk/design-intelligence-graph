import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleLlmProvider, type LlmProviderConfig } from "../src/llm-provider.js";

test("OpenAiCompatibleLlmProvider sends reasoning effort and reads string content", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const provider = new OpenAiCompatibleLlmProvider(
    {
      enabled: true,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "qwen/qwen3.7-flash",
      apiKey: "test-key",
      timeoutMs: 5000,
      reasoningEffort: "none"
    } satisfies LlmProviderConfig,
    async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          model: "qwen/qwen3.7-flash",
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  );
  const result = await provider.complete([{ role: "user", content: "hi" }], { maxTokens: 100 });
  assert.equal(result.content, "{\"ok\":true}");
  if (!capturedBody) throw new Error("expected request body");
  assert.deepEqual(capturedBody["reasoning"], { effort: "none" });
  assert.equal(capturedBody["enable_thinking"], false);
});

test("OpenAiCompatibleLlmProvider explains empty content when reasoning burned tokens", async () => {
  const provider = new OpenAiCompatibleLlmProvider(
    {
      enabled: true,
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "qwen/qwen3.7-flash",
      apiKey: "test-key",
      timeoutMs: 5000
    },
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: null, reasoning: "Thinking Process: burn tokens..." }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
  );
  await assert.rejects(
    () => provider.complete([{ role: "user", content: "hi" }]),
    /reasoning burned tokens/
  );
});

test("createLlmProviderFromConfig falls back to OpenRouter when local fetch fails", async () => {
  const { createLlmProviderFromConfig } = await import("../src/llm-provider.js");
  let urls: string[] = [];
  const provider = createLlmProviderFromConfig(
    {
      enabled: true,
      provider: "local",
      baseUrl: "http://127.0.0.1:9/v1",
      model: "qwen/qwen3.7-flash",
      timeoutMs: 2000,
      fallbackProvider: "openrouter",
      reasoningEffort: "none"
    },
    {
      OPENROUTER_API_KEY: "test-key"
    } as NodeJS.ProcessEnv,
    async (url) => {
      urls.push(String(url));
      if (String(url).includes("127.0.0.1:9")) {
        throw new TypeError("fetch failed");
      }
      return new Response(
        JSON.stringify({
          model: "qwen/qwen3.7-flash",
          choices: [{ message: { content: "{\"ok\":true}" }, finish_reason: "stop" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
  );
  const result = await provider.complete([{ role: "user", content: "hi" }], {
    model: "qwen/qwen3.7-flash",
    maxTokens: 50
  });
  assert.equal(result.content, "{\"ok\":true}");
  assert.equal(urls.length, 2);
  assert.match(urls[0]!, /127\.0\.0\.1:9/);
  assert.match(urls[1]!, /openrouter\.ai/);
});
