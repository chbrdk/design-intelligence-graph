import assert from "node:assert/strict";
import test from "node:test";
import {
  listCheckionProjects,
  waitForCheckionScan,
  type CheckionConfig
} from "../src/checkion-client.js";

const hangConfig: CheckionConfig = {
  baseUrl: "https://checkion.test",
  token: "t",
  projectId: "p",
  pollIntervalMs: 20,
  pollTimeoutMs: 60,
  fetchTimeoutMs: 40,
  required: true
};

test("waitForCheckionScan times out while scan stays running", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: "scan_hang",
        projectId: "p",
        mode: "single",
        url: "https://tesla.com/",
        status: "running"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  try {
    await assert.rejects(
      () => waitForCheckionScan("scan_hang", hangConfig),
      /timed out after 60ms/
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("CHECKION JSON fetch aborts when the peer never responds", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
      });
    });
  try {
    await assert.rejects(
      () => listCheckionProjects({ ...hangConfig, fetchTimeoutMs: 30 }),
      /CHECKION request failed/
    );
  } finally {
    globalThis.fetch = original;
  }
});
