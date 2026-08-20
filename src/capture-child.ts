/**
 * Child-process entry for Playwright capture.
 * Keeps Chromium off the dig-api event loop so /api/health stays responsive.
 *
 * IPC:
 *   parent → { type: "run", options: CaptureOptionsSansSignal }
 *   child  → { type: "done", packageRoot: string } | { type: "error", message: string }
 */
import { capture } from "./capture.js";
import type { CaptureOptions } from "./types.js";

export type CaptureChildRunMessage = {
  type: "run";
  options: Omit<CaptureOptions, "signal">;
};

export type CaptureChildResultMessage =
  | { type: "done"; packageRoot: string }
  | { type: "error"; message: string };

function send(message: CaptureChildResultMessage): void {
  if (typeof process.send === "function") {
    process.send(message);
    return;
  }
  process.stderr.write(`capture-child: no IPC channel (${message.type})\n`);
}

async function handle(message: CaptureChildRunMessage): Promise<void> {
  try {
    const result = await capture(message.options);
    send({ type: "done", packageRoot: result.packageRoot });
  } catch (error: unknown) {
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

process.on("message", (raw: unknown) => {
  const message = raw as CaptureChildRunMessage;
  if (!message || message.type !== "run" || !message.options?.url) {
    send({ type: "error", message: "invalid_capture_child_message" });
    return;
  }
  void handle(message).finally(() => {
    // Allow pending consoles to flush, then exit so Chromium cannot outlive the job.
    setTimeout(() => process.exit(0), 10);
  });
});

process.on("disconnect", () => {
  process.exit(1);
});
