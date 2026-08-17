import assert from "node:assert/strict";
import test from "node:test";
import { catalogUrls, captureJobsConfig, loadCaptureCatalog } from "../src/capture-catalog.js";

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

test("captureJobsConfig reads maxConcurrent 3 and maxBatch 100 from paths.json", () => {
  assert.equal(captureJobsConfig().maxConcurrent, 3);
  assert.equal(captureJobsConfig().maxBatch, 100);
  assert.match(captureJobsConfig().crossIndustry100, /cross-industry-100\.json$/);
});

test("cross-industry-100 catalog has 100 unique https urls across industries", () => {
  const catalog = loadCaptureCatalog("cross-industry-100");
  assert.equal(catalog.entries.length, 100);
  const urls = catalogUrls(catalog);
  assert.equal(urls.length, 100);
  assert.equal(new Set(urls).size, 100);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 100);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  const groups = new Set(catalog.entries.map((entry) => entry.group));
  assert.ok(groups.size >= 20);
  assert.ok(urls.some((url) => url.includes("amazon")));
  assert.ok(urls.some((url) => url.includes("airbnb")));
  assert.ok(urls.some((url) => url.includes("siemens")));
  const auto = loadCaptureCatalog("automotive-oem-50");
  const autoUrls = new Set(catalogUrls(auto));
  for (const url of urls) {
    assert.equal(autoUrls.has(url), false, `overlap with automotive catalog: ${url}`);
  }
});
