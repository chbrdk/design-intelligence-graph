import assert from "node:assert/strict";
import test from "node:test";
import { catalogUrls, loadCaptureCatalog } from "../src/capture-catalog.js";

test("automotive-oem-50 catalog has 50 unique https manufacturer urls", () => {
  const catalog = loadCaptureCatalog("automotive-oem-50");
  assert.equal(catalog.entries.length, 50);
  const urls = catalogUrls(catalog);
  assert.equal(urls.length, 50);
  assert.equal(new Set(urls).size, 50);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  assert.ok(urls.some((url) => url.includes("toyota")));
  assert.ok(urls.some((url) => url.includes("audi")));
});
