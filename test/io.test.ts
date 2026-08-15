import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createId, safeDirectoryName, sha256, toJsonLines, writeArtifact, writeJsonLinesArtifact } from "../src/io.js";

test("createId creates capture-local identifiers", () => {
  assert.match(createId("cap"), /^cap_[a-f0-9]{32}$/);
});

test("sha256 is deterministic", () => {
  assert.equal(sha256("DIG"), "sha256:6fcbc15bc5b6c39894613cf9091ec1975b2a262f63dd532734a6d22d16035a46");
});

test("safeDirectoryName includes host and normalized route", () => {
  assert.equal(safeDirectoryName(new URL("https://example.com/design/intelligence?x=1")), "example.com_design-intelligence");
  assert.equal(safeDirectoryName(new URL("https://example.com/")), "example.com_home");
});

test("toJsonLines creates newline-delimited JSON", () => {
  assert.equal(toJsonLines([{ a: 1 }, { b: 2 }]), '{"a":1}\n{"b":2}\n');
  assert.equal(toJsonLines([]), "");
});

test("writeArtifact writes content and returns integrity metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-test-"));
  const artifact = await writeArtifact(root, "nested/test.txt", "hello", "text/plain");
  assert.equal(await readFile(join(root, artifact.path), "utf8"), "hello");
  assert.equal(artifact.bytes, 5);
  assert.equal(artifact.sha256, sha256("hello"));
});

test("writeJsonLinesArtifact streams lines and matches toJsonLines hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-jsonl-"));
  const records = [{ a: 1 }, { b: "x" }, { nested: { ok: true } }];
  const artifact = await writeJsonLinesArtifact(root, "out.jsonl", records);
  const body = await readFile(join(root, artifact.path), "utf8");
  assert.equal(body, toJsonLines(records));
  assert.equal(artifact.sha256, sha256(body));
  assert.equal(artifact.bytes, Buffer.byteLength(body, "utf8"));
  assert.equal(artifact.media_type, "application/x-ndjson");
});
