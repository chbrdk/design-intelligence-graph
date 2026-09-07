import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectFlowFollowSuggestions,
  resolveSameOriginFollowUrl
} from "../src/flow-follow.js";
import type { FlowCandidate } from "../src/flow-candidates.js";

function cand(partial: Partial<FlowCandidate> & Pick<FlowCandidate, "candidate_id" | "destination">): FlowCandidate {
  return {
    node_id: "n1",
    viewport_capture_id: "vpc",
    control_kind: "link",
    destination_class: "internal_path",
    candidacy_score: 0.9,
    safety: "href_join_only",
    layer: "L2",
    method: "link_href_scan",
    evidence: [{ kind: "attribute", fact: "href", value: partial.destination }],
    ...partial
  };
}

test("isLowValueFollowUrl drops stores legal and auth paths", async () => {
  const { isLowValueFollowUrl } = await import("../src/flow-follow.js");
  assert.equal(isLowValueFollowUrl("https://apps.apple.com/gb/app/1"), true);
  assert.equal(isLowValueFollowUrl("https://shop.example/legal/terms"), true);
  assert.equal(isLowValueFollowUrl("https://shop.example/my-account"), true);
  assert.equal(isLowValueFollowUrl("https://museum.example/en/privacy-policy/"), true);
  assert.equal(isLowValueFollowUrl("https://museum.example/en/publishing-information/"), true);
  assert.equal(isLowValueFollowUrl("https://dribbble.com/signups/new"), true);
  assert.equal(isLowValueFollowUrl("https://shop.example/work/case-study"), false);
});

test("resolveSameOriginFollowUrl keeps same origin and drops external", () => {
  assert.equal(
    resolveSameOriginFollowUrl(
      "https://shop.example/",
      cand({ candidate_id: "a", destination: "/pricing" })
    ),
    "https://shop.example/pricing"
  );
  assert.equal(
    resolveSameOriginFollowUrl(
      "https://shop.example/",
      cand({
        candidate_id: "b",
        destination: "https://other.example/x",
        destination_class: "external"
      })
    ),
    null
  );
});

test("collectFlowFollowSuggestions skips urls already in corpus", async () => {
  const root = await mkdtemp(join(tmpdir(), "dig-follow-"));
  try {
    const home = join(root, "home");
    await mkdir(join(home, "derived"), { recursive: true });
    await writeFile(
      join(home, "manifest.json"),
      JSON.stringify({
        capture_run_id: "cap_home",
        canonical_url: "https://shop.example/",
        site: { site_id: "shop" }
      })
    );
    await writeFile(
      join(home, "derived/flow-candidates.json"),
      JSON.stringify({
        schema_version: "0.1.0",
        capture_run_id: "cap_home",
        generated_at: new Date().toISOString(),
        candidates: [
          cand({ candidate_id: "c1", destination: "/pricing", candidacy_score: 0.95 }),
          cand({ candidate_id: "c2", destination: "/work/case-study", candidacy_score: 0.8 }),
          cand({ candidate_id: "c3", destination: "/", candidacy_score: 0.99 })
        ]
      })
    );
    const suggestions = await collectFlowFollowSuggestions(
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
          package_path: home,
          site_domain: "shop.example"
        }
      ],
      { maxPerHost: 4, minScore: 0.3 }
    );
    assert.equal(suggestions.some((item) => item.url.includes("/pricing")), false);
    assert.equal(suggestions.some((item) => item.url.includes("/work/case-study")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
