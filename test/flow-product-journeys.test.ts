import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("flow-product-journeys catalog is purposeful SaaS auth/pricing seeds", async () => {
  const catalog = JSON.parse(
    await readFile(resolve("knowledge/flow-product-journeys.json"), "utf8")
  ) as {
    journeys: Array<{ app_scope_id: string; urls: string[] }>;
  };
  const paths = JSON.parse(await readFile(resolve("knowledge/paths.json"), "utf8")) as {
    flowSeed?: { productJourneys?: string };
  };
  assert.equal(paths.flowSeed?.productJourneys, "knowledge/flow-product-journeys.json");
  assert.ok(catalog.journeys.length >= 4);
  for (const journey of catalog.journeys) {
    assert.match(journey.app_scope_id, /^app_/);
    assert.ok(journey.urls.length >= 3);
    const hosts = new Set(journey.urls.map((url) => new URL(url).hostname));
    assert.equal(hosts.size, 1, `${journey.app_scope_id} must stay same-host for href_join`);
    const joined = journey.urls.join(" ").toLowerCase();
    assert.ok(/login|signin|sign-in|create-account|signup|sign-up/.test(joined));
    assert.ok(joined.includes("pricing"));
  }
});
