import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  clusterCapturesByHost,
  discoverFlowsFromCaptures,
  hostFromCapture
} from "../src/flow-discover.js";

test("hostFromCapture prefers site_domain and skips junk", () => {
  assert.equal(
    hostFromCapture({ canonical_url: "https://Shop.Example/a", site_domain: "shop.example" }),
    "shop.example"
  );
  assert.equal(hostFromCapture({ canonical_url: "https://localhost/x", site_domain: null }), null);
});

test("clusterCapturesByHost dedupes join urls and caps screens", () => {
  const clusters = clusterCapturesByHost(
    [
      {
        capture_run_id: "a",
        canonical_url: "https://shop.example/",
        package_path: "/p/a",
        site_domain: "shop.example"
      },
      {
        capture_run_id: "a2",
        canonical_url: "https://shop.example",
        package_path: "/p/a2",
        site_domain: "shop.example"
      },
      {
        capture_run_id: "b",
        canonical_url: "https://shop.example/pricing",
        package_path: "/p/b",
        site_domain: "shop.example"
      },
      {
        capture_run_id: "c",
        canonical_url: "https://other.example/",
        package_path: "/p/c",
        site_domain: "other.example"
      }
    ],
    { maxScreensPerSite: 12 }
  );
  assert.equal(clusters.get("shop.example")?.length, 2);
  assert.equal(clusters.get("other.example")?.length, 1);
});

test("discoverFlowsFromCaptures indexes href_join flows", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-flow-discover-"));
  const prev = process.env.DIG_INDEXES_DIR;
  process.env.DIG_INDEXES_DIR = join(root, "indexes");
  try {
    const home = join(root, "home");
    const pricing = join(root, "pricing");
    await mkdir(join(home, "derived"), { recursive: true });
    await mkdir(join(pricing, "derived"), { recursive: true });
    await writeFile(
      join(home, "manifest.json"),
      JSON.stringify({
        capture_run_id: "cap_home",
        canonical_url: "https://shop.example/",
        site: { site_id: "shop" }
      })
    );
    await writeFile(
      join(pricing, "manifest.json"),
      JSON.stringify({
        capture_run_id: "cap_pricing",
        canonical_url: "https://shop.example/pricing",
        site: { site_id: "shop" }
      })
    );
    await writeFile(
      join(home, "derived/flow-candidates.json"),
      JSON.stringify({
        schema_version: "0.1.0",
        candidates: [
          {
            candidate_id: "cand_1",
            node_id: "n1",
            viewport_capture_id: "vpc",
            control_kind: "link",
            destination: "https://shop.example/pricing",
            destination_class: "internal_path",
            candidacy_score: 0.9,
            safety: "href_join_only",
            layer: "L2",
            method: "link_href_scan",
            evidence: [{ kind: "attribute", fact: "href", value: "/pricing" }],
            hotspot_box: { x: 1, y: 2, width: 10, height: 10, space: "document" }
          }
        ]
      })
    );
    await writeFile(
      join(pricing, "derived/flow-candidates.json"),
      JSON.stringify({ schema_version: "0.1.0", candidates: [] })
    );

    const result = await discoverFlowsFromCaptures(
      [
        {
          capture_run_id: "cap_home",
          canonical_url: "https://shop.example/",
          package_path: home,
          site_domain: "shop.example"
        },
        {
          capture_run_id: "cap_pricing",
          canonical_url: "https://shop.example/pricing",
          package_path: pricing,
          site_domain: "shop.example"
        }
      ],
      { maxSites: 5, minHrefEdges: 1 }
    );
    assert.equal(result.indexed.length, 1);
    assert.equal(result.indexed[0]!.href_edge_count, 1);
    assert.equal(result.indexed[0]!.hotspot_count, 1);
    assert.ok(result.indexed[0]!.flow_id);
  } finally {
    if (prev === undefined) delete process.env.DIG_INDEXES_DIR;
    else process.env.DIG_INDEXES_DIR = prev;
    await rm(root, { recursive: true, force: true });
  }
});
