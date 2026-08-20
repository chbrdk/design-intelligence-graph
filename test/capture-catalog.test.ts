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

test("captureJobsConfig reads maxConcurrent 4, hardTimeoutMs, and maxBatch from paths.json", () => {
  assert.equal(captureJobsConfig().maxConcurrent, 4);
  assert.equal(captureJobsConfig().hardTimeoutMs, 480_000);
  assert.equal(captureJobsConfig().checkionTimeoutMs, 120_000);
  assert.equal(captureJobsConfig().maxBatch, 1000);
  assert.match(captureJobsConfig().crossIndustry100, /cross-industry-100\.json$/);
  assert.match(captureJobsConfig().engineeringManufacturing1000, /engineering-manufacturing-1000\.json$/);
  assert.match(captureJobsConfig().insurance1000, /insurance-1000\.json$/);
  assert.match(captureJobsConfig().insurancePlus500, /insurance-plus-500\.json$/);
  assert.match(captureJobsConfig().designDiversity1000, /design-diversity-1000\.json$/);
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

test("engineering-manufacturing-1000 has 1000 unique https urls and skips prior catalogs", () => {
  const catalog = loadCaptureCatalog("engineering-manufacturing-1000");
  assert.equal(catalog.entries.length, 1000);
  const urls = catalogUrls(catalog);
  assert.equal(new Set(urls).size, 1000);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 1000);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  const prior = new Set([
    ...catalogUrls(loadCaptureCatalog("automotive-oem-50")),
    ...catalogUrls(loadCaptureCatalog("cross-industry-100"))
  ]);
  for (const url of urls) {
    assert.equal(prior.has(url), false, `overlap with prior catalog: ${url}`);
  }
  const groups = new Set(catalog.entries.map((entry) => entry.group));
  assert.ok(groups.size >= 20);
  assert.ok(urls.some((url) => url.includes("asml")));
  assert.ok(urls.some((url) => url.includes("caterpillar") || url.includes("komatsu")));
});

test("insurance-1000 has 1000 unique https urls and skips prior catalogs", () => {
  const catalog = loadCaptureCatalog("insurance-1000");
  assert.equal(catalog.entries.length, 1000);
  const urls = catalogUrls(catalog);
  assert.equal(new Set(urls).size, 1000);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 1000);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  const prior = new Set([
    ...catalogUrls(loadCaptureCatalog("automotive-oem-50")),
    ...catalogUrls(loadCaptureCatalog("cross-industry-100")),
    ...catalogUrls(loadCaptureCatalog("engineering-manufacturing-1000"))
  ]);
  for (const url of urls) {
    assert.equal(prior.has(url), false, `overlap with prior catalog: ${url}`);
  }
  const groups = new Set(catalog.entries.map((entry) => entry.group));
  assert.ok(groups.size >= 20);
  assert.ok(urls.some((url) => url.includes("allianz")));
  assert.ok(urls.some((url) => url.includes("statefarm") || url.includes("progressive")));
  assert.ok(urls.some((url) => url.includes("swissre") || url.includes("munichre")));
  assert.ok(urls.some((url) => url.includes("lemonade") || url.includes("marsh")));
});

test("insurance-plus-500 has 500 unique https urls and skips prior catalogs", () => {
  const catalog = loadCaptureCatalog("insurance-plus-500");
  assert.equal(catalog.entries.length, 500);
  const urls = catalogUrls(catalog);
  assert.equal(new Set(urls).size, 500);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 500);
  const hosts = new Set(
    urls.map((url) => new URL(url).hostname.replace(/^www\./i, "").toLowerCase())
  );
  assert.equal(hosts.size, 500);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  const priorHosts = new Set(
    [
      ...catalogUrls(loadCaptureCatalog("automotive-oem-50")),
      ...catalogUrls(loadCaptureCatalog("cross-industry-100")),
      ...catalogUrls(loadCaptureCatalog("engineering-manufacturing-1000")),
      ...catalogUrls(loadCaptureCatalog("insurance-1000"))
    ].map((url) => new URL(url).hostname.replace(/^www\./i, "").toLowerCase())
  );
  for (const host of hosts) {
    assert.equal(priorHosts.has(host), false, `overlap with prior catalog host: ${host}`);
  }
  const groups = new Set(catalog.entries.map((entry) => entry.group));
  const countries = new Set(catalog.entries.map((entry) => entry.country));
  assert.ok(groups.size >= 12);
  assert.ok(countries.size >= 40);
  assert.ok(urls.some((url) => url.includes("nn.nl") || url.includes("sagicor")));
  assert.ok(urls.some((url) => url.includes("bajajallianz") || url.includes("fwd.com")));
});

test("design-diversity-1000 has 1000 unique https urls and skips prior catalogs", () => {
  const catalog = loadCaptureCatalog("design-diversity-1000");
  assert.equal(catalog.entries.length, 1000);
  const urls = catalogUrls(catalog);
  assert.equal(new Set(urls).size, 1000);
  assert.equal(new Set(catalog.entries.map((entry) => entry.id)).size, 1000);
  const hosts = new Set(
    urls.map((url) => new URL(url).hostname.replace(/^www\./i, "").toLowerCase())
  );
  assert.equal(hosts.size, 1000);
  for (const url of urls) {
    assert.match(url, /^https:\/\//);
  }
  const priorHosts = new Set(
    [
      ...catalogUrls(loadCaptureCatalog("automotive-oem-50")),
      ...catalogUrls(loadCaptureCatalog("cross-industry-100")),
      ...catalogUrls(loadCaptureCatalog("engineering-manufacturing-1000")),
      ...catalogUrls(loadCaptureCatalog("insurance-1000")),
      ...catalogUrls(loadCaptureCatalog("insurance-plus-500"))
    ].map((url) => new URL(url).hostname.replace(/^www\./i, "").toLowerCase())
  );
  for (const host of hosts) {
    assert.equal(priorHosts.has(host), false, `overlap with prior catalog host: ${host}`);
  }
  const groups = new Set(catalog.entries.map((entry) => entry.group));
  assert.ok(groups.size >= 10);
  assert.ok(urls.some((url) => url.includes("linear.app") || url.includes("notion")));
  assert.ok(urls.some((url) => url.includes("zalando") || url.includes("asos")));
});
