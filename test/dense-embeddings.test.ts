import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildDenseEmbeddingSubjects } from "../src/dense-embedding-subjects.js";
import {
  canonicalSha256,
  denseEmbeddingsEnabled,
  embedTextsOpenRouter,
  formatDenseQuery
} from "../src/dense-embeddings.js";
import {
  embedDenseSubjectsForCapture,
  denseSubjectsForDesignReferences
} from "../src/dense-embedding-package.js";

test("denseEmbeddingsEnabled requires live status or DIG_EMBEDDING_ENABLED and API key", () => {
  const prev = { ...process.env };
  try {
    delete process.env.DIG_EMBEDDING_ENABLED;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.DIG_LLM_API_KEY;
    assert.equal(denseEmbeddingsEnabled(), false);
    process.env.DIG_EMBEDDING_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    assert.equal(denseEmbeddingsEnabled(), true);
  } finally {
    process.env = prev;
  }
});

test("formatDenseQuery prefixes the instruction", () => {
  const text = formatDenseQuery("minimal monochrome");
  assert.match(text, /^Retrieve website screens/);
  assert.match(text, /minimal monochrome$/);
});

test("embedTextsOpenRouter parses OpenRouter batch embeddings", async () => {
  const prev = { ...process.env };
  try {
    process.env.DIG_EMBEDDING_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const vectors = await embedTextsOpenRouter(["alpha", "beta"], {
      dims: 1024,
      request: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, "qwen/qwen3-embedding-8b");
        assert.equal(body.dimensions, 1024);
        assert.deepEqual(body.input, ["alpha", "beta"]);
        return new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: Array.from({ length: 1024 }, (_, i) => (i === 1 ? 1 : 0)) },
              { index: 0, embedding: Array.from({ length: 1024 }, (_, i) => (i === 0 ? 1 : 0)) }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    });
    assert.equal(vectors.length, 2);
    assert.equal(vectors[0]![0], 1);
    assert.equal(vectors[1]![1], 1);
  } finally {
    process.env = prev;
  }
});

test("embedDenseSubjectsForCapture skips unchanged canonical sha256", async () => {
  const prev = { ...process.env };
  try {
    process.env.DIG_EMBEDDING_ENABLED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const content = "kind:screen\nindustry:insurance";
    const subject = {
      subject_kind: "screen",
      subject_id: "cap_test",
      content_text: content,
      canonical_sha256: canonicalSha256(content)
    };
    let fetchCalls = 0;
    const client = {
      queries: [] as string[],
      async query(sql: string, params?: unknown[]) {
        this.queries.push(sql);
        if (/SELECT subject_kind, subject_id, canonical_sha256/i.test(sql)) {
          return { rows: [{ subject_kind: "screen", subject_id: "cap_test", canonical_sha256: subject.canonical_sha256 }] };
        }
        if (/INSERT INTO dense_embeddings/i.test(sql)) {
          assert.fail("should not upsert unchanged canonical");
        }
        return { rows: [] };
      }
    };
    const written = await embedDenseSubjectsForCapture(client, "cap_test", [subject], {
      request: async () => {
        fetchCalls += 1;
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(1024).fill(0.1) }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    });
    assert.equal(written, 0);
    assert.equal(fetchCalls, 0);
  } finally {
    process.env = prev;
  }
});

test("buildDenseEmbeddingSubjects emits screen + gallery modules after enrichment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-dense-"));
  await mkdir(join(dir, "derived"), { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({ capture_run_id: "cap_dense_test" }),
    "utf8"
  );
  await writeFile(
    join(dir, "derived/llm-design.json"),
    JSON.stringify({
      status: "complete",
      design_summary:
        "Reads as: editorial insurance homepage. Layout: full-bleed stacks; Look: monochrome; calm; Media: sparse photography; Type/image: monumental overlap; Type craft: large display type; Above the fold job: explain value fast; Rhythm: hero then proof.",
      mobbin: {
        section_descriptions: [
          {
            section_id: "hero_1",
            signature: "brand_hero",
            category: "hero",
            look_summary: "Large headline over quiet photography.",
            confidence: 0.9,
            evidence_refs: []
          },
          {
            section_id: "body_1",
            signature: "body",
            category: "content",
            look_summary: "Long text block.",
            confidence: 0.8,
            evidence_refs: []
          }
        ]
      }
    }),
    "utf8"
  );
  const subjects = await buildDenseEmbeddingSubjects(dir, "cap_dense_test");
  assert.equal(subjects.some((item) => item.subject_kind === "screen"), true);
  assert.equal(subjects.some((item) => item.subject_kind === "module" && item.subject_id === "hero_1"), true);
  assert.equal(subjects.some((item) => item.subject_id === "body_1"), false);
});

test("denseSubjectsForDesignReferences uses design reference canonical", () => {
  const subjects = denseSubjectsForDesignReferences([
    {
      reference_id: "ref_test",
      capture_run_id: "cap_test",
      taxonomy: { category: "hero", signature: "brand_hero" },
      composition: { signature: "brand_hero", stack_summary: "headline over image" },
      look: { look_summary: "Large type over photography." },
      tokens: { style_labels: ["editorial"] }
    } as never
  ]);
  assert.equal(subjects.length, 1);
  assert.match(subjects[0]!.content_text, /^category:hero/);
});
