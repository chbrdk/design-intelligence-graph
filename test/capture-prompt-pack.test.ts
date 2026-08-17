import assert from "node:assert/strict";
import test from "node:test";
import { assemblePromptPackForCaptureRun } from "../src/capture-prompt-pack.js";

test("assemblePromptPackForCaptureRun throws capture_not_found", async () => {
  const client = {
    async query() {
      return { rows: [] };
    }
  };
  await assert.rejects(
    () => assemblePromptPackForCaptureRun(client, "cap_missing", {}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "capture_not_found");
      assert.equal((error as Error & { status?: number }).status, 404);
      return true;
    }
  );
});

test("assemblePromptPackForCaptureRun throws database_unavailable without client", async () => {
  await assert.rejects(
    () => assemblePromptPackForCaptureRun(null, "cap_any", {}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "database_unavailable");
      assert.equal((error as Error & { status?: number }).status, 503);
      return true;
    }
  );
});
