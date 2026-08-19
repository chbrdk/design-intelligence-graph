import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  embedScreenshotForPackage,
  embedScreenshotOpenRouter,
  formatScreenshotQuery,
  screenshotEmbeddingsEnabled
} from "../src/screenshot-embeddings.js";

test("screenshotEmbeddingsEnabled requires live status or force flag and API key", () => {
  const prev = { ...process.env };
  try {
    delete process.env.DIG_SCREENSHOT_EMBEDDING_ENABLED;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DIG_LLM_API_KEY;
    assert.equal(screenshotEmbeddingsEnabled(), false);
    process.env.OPENROUTER_API_KEY = "test-key";
    assert.equal(screenshotEmbeddingsEnabled(), true);
    process.env.DIG_SCREENSHOT_EMBEDDING_ENABLED = "0";
    assert.equal(screenshotEmbeddingsEnabled(), false);
  } finally {
    process.env = prev;
  }
});

test("formatScreenshotQuery prefixes the visual instruction", () => {
  const text = formatScreenshotQuery("large type few images");
  assert.match(text, /^Retrieve website screenshots/);
  assert.match(text, /large type few images$/);
});

test("embedScreenshotOpenRouter sends image_url data URL at 768 dims", async () => {
  const prev = { ...process.env };
  process.env.OPENROUTER_API_KEY = "test-key";
  try {
    const vector = await embedScreenshotOpenRouter("data:image/png;base64,AAAA", {
      request: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "google/gemini-embedding-2");
        assert.equal(body.dimensions, 768);
        assert.equal(body.input[0].type, "image_url");
        assert.equal(body.input[0].image_url.url, "data:image/png;base64,AAAA");
        return new Response(JSON.stringify({ data: [{ embedding: Array(768).fill(0.1) }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });
    assert.equal(vector.length, 768);
  } finally {
    process.env = prev;
  }
});

test("embedScreenshotForPackage skips unchanged canonical sha256", async () => {
  const prev = { ...process.env };
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.DIG_SCREENSHOT_EMBEDDING_ENABLED = "true";
  const dir = await mkdtemp(join(tmpdir(), "dig-shot-"));
  await mkdir(join(dir, "viewports/desktop/screenshots"), { recursive: true });
  const bytes = Buffer.from("fake-png-bytes");
  await writeFile(join(dir, "viewports/desktop/screenshots/full-page.webp"), bytes);
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(bytes).digest("hex");
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      capture_run_id: "cap_shot",
      viewport_captures: [
        {
          name: "desktop",
          artifacts: {
            playwright_full_page_screenshot: { path: "viewports/desktop/screenshots/full-page.webp" }
          }
        }
      ]
    })
  );
  let embeds = 0;
  const client = {
    async query(sql: string) {
      if (/SELECT canonical_sha256/i.test(sql)) {
        return { rows: [{ canonical_sha256: sha }] };
      }
      embeds += 1;
      return { rows: [] };
    }
  };
  try {
    const written = await embedScreenshotForPackage(dir, {
      client,
      request: async () => {
        throw new Error("should_skip_openrouter");
      }
    });
    assert.equal(written, 0);
    assert.equal(embeds, 0);
  } finally {
    process.env = prev;
  }
});
