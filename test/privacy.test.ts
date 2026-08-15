import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDiagnostic, sanitizeEvidenceUrls, sanitizeHtml, sanitizeNodeRecords, sanitizeStoredUrl } from "../src/privacy.js";

test("sanitizes stored absolute and relative URLs", () => {
  assert.equal(sanitizeStoredUrl("https://example.com/path?token=secret#part"), "https://example.com/path?token=%5Bredacted%5D");
  assert.equal(sanitizeStoredUrl("/next?page=2", "https://example.com/base"), "https://example.com/next?page=%5Bredacted%5D");
});

test("sanitizes DOM URL attributes and password values", () => {
  const [node] = sanitizeNodeRecords([{
    node_id: "node_1", node_type: "element", tag: "input", dom_path: "input", rendered: true,
    attributes: { type: "password", value: "super-secret", formaction: "/login?session=abc" },
    source_anchor: { href: "/account?user=42" }
  }], "https://example.com/");
  assert.equal(node?.attributes?.value, "[redacted]");
  assert.equal(node?.attributes?.formaction, "https://example.com/login?session=%5Bredacted%5D");
  assert.equal(node?.source_anchor?.href, "https://example.com/account?user=%5Bredacted%5D");
});

test("sanitizes HTML navigation attributes and password values", () => {
  const result = sanitizeHtml(
    '<a href="/next?token=secret">Next</a><input type="password" value="secret">',
    "https://example.com/"
  );
  assert.doesNotMatch(result, /secret/);
  assert.match(result, /token=%5Bredacted%5D/);
  assert.match(result, /value="\[redacted\]"/);
});

test("sanitizes diagnostics without retaining bearer tokens", () => {
  const result = sanitizeDiagnostic("Failed https://example.com/?key=value with Bearer abc.def and token=raw");
  assert.doesNotMatch(result, /abc\.def|value|token=raw/);
  assert.match(result, /Bearer \[redacted\]/);
});

test("recursively sanitizes asset and CSS URLs", () => {
  const result = sanitizeEvidenceUrls({
    href: "/style.css?v=secret",
    rules: [{ css_text: "background: url('/image.png?token=secret')" }]
  }, "https://example.com/");
  assert.equal(result.href, "https://example.com/style.css?v=%5Bredacted%5D");
  assert.doesNotMatch(result.rules[0]!.css_text, /secret/);
});

test("sanitizes nested accessibility URL properties", () => {
  const [property] = sanitizeEvidenceUrls([{
    name: "url", value: { type: "string", value: "https://example.com/?session=secret#details" }
  }], "https://example.com/");
  assert.equal(property.value.value, "https://example.com/?session=%5Bredacted%5D");
});
