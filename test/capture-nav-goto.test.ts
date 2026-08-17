import assert from "node:assert/strict";
import test from "node:test";
import type { Page, Response } from "playwright";
import { detectNavBarrierFromDocument, gotoWithNavGuard } from "../src/capture-nav.js";

test("gotoWithNavGuard retries Access Denied then recovers", async () => {
  let hits = 0;
  const html = () =>
    hits < 3
      ? {
          title: "Access Denied",
          body: `You don't have permission to access this server.`,
          status: 403
        }
      : { title: "Audi Modelle", body: "Modelle", status: 200 };

  const page = {
    async goto() {
      hits += 1;
      const current = html();
      return {
        status: () => current.status,
        ok: () => current.status < 400
      } as Response;
    },
    async reload() {
      hits += 1;
    },
    async evaluate() {
      const current = html();
      return detectNavBarrierFromDocument({
        title: current.title,
        bodyText: current.body,
        hasSelector: () => false
      });
    }
  } as unknown as Page;

  const result = await gotoWithNavGuard(page, "https://www.audi.de/", 10_000, {
    challengeWaitMs: 50,
    maxRetries: 3,
    retryBaseMs: 1,
    jobTimeoutMs: 10_000
  });
  assert.equal(result.blocked, false);
  assert.equal(result.barrier.isBarrier, false);
  assert.ok(hits >= 3);
});
