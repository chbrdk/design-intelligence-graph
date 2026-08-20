import assert from "node:assert/strict";
import test from "node:test";
import { DeadlineError, throwIfAborted, withDeadline } from "../src/deadline.js";

test("withDeadline resolves when work finishes first", async () => {
  const value = await withDeadline(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 42;
  }, 200);
  assert.equal(value, 42);
});

test("withDeadline rejects and calls onExpire when timer wins", async () => {
  let expired = false;
  await assert.rejects(
    () =>
      withDeadline(
        () => new Promise(() => undefined),
        30,
        () => {
          expired = true;
        },
        "capture"
      ),
    (error: unknown) => error instanceof DeadlineError && error.message.includes("capture_hard_timeout")
  );
  assert.equal(expired, true);
});

test("throwIfAborted throws AbortError reason", () => {
  const abort = new AbortController();
  abort.abort(new Error("stopped"));
  assert.throws(() => throwIfAborted(abort.signal), /stopped/);
});
