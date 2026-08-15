import assert from "node:assert/strict";
import test from "node:test";
import { MAX_HASHABLE_RESOURCE_BYTES, sanitizeUrl, shouldHashResource } from "../src/network.js";

test("sanitizeUrl redacts query values and fragments", () => {
  assert.equal(
    sanitizeUrl("https://example.com/path?token=secret&page=2#private"),
    "https://example.com/path?token=%5Bredacted%5D&page=%5Bredacted%5D"
  );
});

test("sanitizeUrl preserves query parameter names and repeated values", () => {
  assert.equal(
    sanitizeUrl("https://example.com/?tag=one&tag=two"),
    "https://example.com/?tag=%5Bredacted%5D&tag=%5Bredacted%5D"
  );
});

test("sanitizeUrl rejects malformed URLs without leaking input", () => {
  assert.equal(sanitizeUrl("not a url?token=secret"), "[invalid-url]");
});

test("hashing policy allows only bounded static resources", () => {
  assert.equal(shouldHashResource("stylesheet", 1024), true);
  assert.equal(shouldHashResource("image"), true);
  assert.equal(shouldHashResource("fetch", 1024), false);
  assert.equal(shouldHashResource("document", 1024), false);
  assert.equal(shouldHashResource("font", MAX_HASHABLE_RESOURCE_BYTES + 1), false);
});
