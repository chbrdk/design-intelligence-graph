import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runCaptureInChild } from "../src/capture-child-client.js";
import { DeadlineError, withDeadline } from "../src/deadline.js";

const stub = fileURLToPath(new URL("./fixtures/capture-child-stub.mjs", import.meta.url));

test("runCaptureInChild returns manifest written by the child", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "dig-child-ok-"));
  const result = await runCaptureInChild(
    {
      url: "https://ok.example/",
      outputDirectory,
      viewports: [{ name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 }],
      timeoutMs: 1000,
      settleMs: 10,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "no-preference",
      headed: false
    },
    { scriptPath: stub }
  );
  assert.equal(result.manifest.capture_run_id, "cap_child_test");
  assert.equal(result.manifest.status, "complete");
  assert.ok(result.packageRoot.includes("child-pkg"));
});

test("runCaptureInChild surfaces child error messages", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "dig-child-err-"));
  await assert.rejects(
    () =>
      runCaptureInChild(
        {
          url: "https://boom.example/",
          outputDirectory,
          viewports: [{ name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 }],
          timeoutMs: 1000,
          settleMs: 10,
          locale: "en-US",
          timezoneId: "UTC",
          colorScheme: "light",
          reducedMotion: "no-preference",
          headed: false
        },
        { scriptPath: stub }
      ),
    /boom_from_child/
  );
});

test("runCaptureInChild SIGKILLs on AbortSignal", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "dig-child-abort-"));
  const abort = new AbortController();
  const pending = runCaptureInChild(
    {
      url: "https://hang.example/",
      outputDirectory,
      viewports: [{ name: "desktop", width: 1440, height: 900, deviceScaleFactor: 1 }],
      timeoutMs: 1000,
      settleMs: 10,
      locale: "en-US",
      timezoneId: "UTC",
      colorScheme: "light",
      reducedMotion: "no-preference",
      headed: false
    },
    { scriptPath: stub, signal: abort.signal }
  );
  setTimeout(() => abort.abort(new DeadlineError(50, "capture_child")), 40);
  await assert.rejects(() => pending, (error: unknown) => error instanceof DeadlineError);
});

test("withDeadline still races independently", async () => {
  await assert.rejects(
    () => withDeadline(() => new Promise(() => undefined), 20, undefined, "x"),
    (error: unknown) => error instanceof DeadlineError
  );
});
