import assert from "node:assert/strict";
import test from "node:test";
import type { Page, Response } from "playwright";
import { gotoWithNavGuard } from "../src/capture-nav.js";

function mockPage(html: () => { title: string; body: string; status: number }): Page {
  return {
    async goto() {
      const current = html();
      return {
        status: () => current.status,
        ok: () => current.status < 400
      } as Response;
    },
    async reload() {
      html();
    },
    async evaluate() {
      const current = html();
      return {
        title: current.title,
        bodyText: current.body,
        present: []
      };
    }
  } as unknown as Page;
}

test("gotoWithNavGuard retries Access Denied then recovers", async () => {
  let hits = 0;
  const page = mockPage(() => {
    hits += 1;
    return hits < 3
      ? {
          title: "Access Denied",
          body: `You don't have permission to access this server.`,
          status: 403
        }
      : { title: "Audi Modelle", body: "Modelle", status: 200 };
  });

  const result = await gotoWithNavGuard(page, "https://www.audi.de/", 10_000, {
    challengeWaitMs: 50,
    maxRetries: 3,
    retryBaseMs: 1
  });
  assert.equal(result.blocked, false);
  assert.equal(result.barrier.isBarrier, false);
  assert.ok(hits >= 3);
});

test("gotoWithNavGuard blocks Audi site-unavailable interstitial", async () => {
  const page = mockPage(() => ({
    title: "Audi - Site currently not available",
    body: "Our site is currently offline due to maintenance activities.",
    status: 200
  }));

  const result = await gotoWithNavGuard(page, "https://www.audi.de/", 10_000, {
    challengeWaitMs: 50,
    maxRetries: 2,
    retryBaseMs: 1
  });
  assert.equal(result.blocked, true);
  assert.equal(result.barrier.kind, "site_unavailable");
});
