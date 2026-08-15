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
