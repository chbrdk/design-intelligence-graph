import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CheckionDomainOverview } from "../src/checkion-client.js";
import {
  buildFlowSeedSession,
  edgesFromSeedSession,
  extractUrlsFromDomainOverview,
  matchSeedUrlsToCaptures,
  persistFlowSeedSession,
  runCheckionDomainSeed,
  FLOW_SEED_SOURCE_CHECKION
} from "../src/flow-seed.js";

const sampleOverview: CheckionDomainOverview = {
  scan: {
    id: "ds_fixture_1",
    projectId: "proj_x",
    rootUrl: "https://shop.example/",
    status: "completed",
    overallScore: 72
  },
  pageSamples: [
    { url: "https://shop.example/", score: 80 },
    { url: "https://shop.example/cart", score: 70 },
    { url: "https://shop.example/checkout", score: 65 },
    { url: "https://shop.example/", score: 80 }
  ]
};

test("extractUrlsFromDomainOverview dedupes root + samples", () => {
  const urls = extractUrlsFromDomainOverview(sampleOverview, { maxUrls: 10 });
  assert.equal(urls.length, 3);
  assert.equal(urls[0]!.url, "https://shop.example/");
  assert.equal(urls[1]!.url, "https://shop.example/cart");
  assert.equal(urls[2]!.url, "https://shop.example/checkout");
});

test("matchSeedUrlsToCaptures + edgesFromSeedSession emit B2 edges", () => {
  const session = buildFlowSeedSession({
    seedSource: FLOW_SEED_SOURCE_CHECKION,
    seedRef: "ds_fixture_1",
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_test",
    urls: extractUrlsFromDomainOverview(sampleOverview)
  });
  const matched = matchSeedUrlsToCaptures(session, [
    { capture_run_id: "run_home", canonical_url: "https://shop.example/" },
    { capture_run_id: "run_cart", canonical_url: "https://shop.example/cart/" },
    { capture_run_id: "run_checkout", canonical_url: "https://shop.example/checkout" }
  ]);
  assert.equal(matched.length, 3);
  const edges = edgesFromSeedSession(session, matched);
  assert.equal(edges.edges.length, 2);
  assert.equal(edges.edges[0]!.method, "seed_sequence");
  assert.match(edges.edges[0]!.provenance.evidence_refs?.[0] ?? "", /checkion_domain_scan:ds_fixture_1:pages\[1\]/);
});

test("persistFlowSeedSession writes under indexes/flow-seeds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dig-flow-seed-"));
  const previous = process.env.DIG_INDEXES_DIR;
  process.env.DIG_INDEXES_DIR = dir;
  try {
    const session = buildFlowSeedSession({
      seedSource: FLOW_SEED_SOURCE_CHECKION,
      seedRef: "ds_x",
      appScopeId: "app_t",
      flowSessionId: "fsess_persist_unique",
      urls: ["https://example.com/"]
    });
    const path = await persistFlowSeedSession(session);
    const raw = await readFile(path, "utf8");
    assert.match(raw, /fsess_persist_unique/);
    assert.match(path, /flow-seeds/);
  } finally {
    if (previous === undefined) delete process.env.DIG_INDEXES_DIR;
    else process.env.DIG_INDEXES_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("runCheckionDomainSeed enqueues missing captures and skips edges until matched", async () => {
  const jobs: string[] = [];
  const result = await runCheckionDomainSeed({
    domainScanId: "ds_fixture_1",
    appScopeId: "app_fixture_shop",
    persist: false,
    overview: sampleOverview,
    captures: [{ capture_run_id: "run_home", canonical_url: "https://shop.example/" }],
    enqueueCapture: async (url) => {
      const job_id = `job_${jobs.length + 1}`;
      jobs.push(url);
      return { job_id };
    }
  });
  assert.equal(result.matched.length, 1);
  assert.equal(result.edges, null);
  assert.deepEqual(result.missing_urls, [
    "https://shop.example/cart",
    "https://shop.example/checkout"
  ]);
  assert.equal(result.enqueued_jobs.length, 2);
  assert.deepEqual(jobs, ["https://shop.example/cart", "https://shop.example/checkout"]);
});

test("runCheckionDomainSeed emits edges when all seeds match captures", async () => {
  const result = await runCheckionDomainSeed({
    domainScanId: "ds_fixture_1",
    appScopeId: "app_fixture_shop",
    flowSessionId: "fsess_full",
    persist: false,
    overview: sampleOverview,
    captures: [
      { capture_run_id: "run_home", canonical_url: "https://shop.example/" },
      { capture_run_id: "run_cart", canonical_url: "https://shop.example/cart" },
      { capture_run_id: "run_checkout", canonical_url: "https://shop.example/checkout" }
    ]
  });
  assert.equal(result.missing_urls.length, 0);
  assert.ok(result.edges);
  assert.equal(result.edges!.edges.length, 2);
});
