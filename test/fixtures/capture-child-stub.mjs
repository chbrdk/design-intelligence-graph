/**
 * Minimal IPC capture child for unit tests (no Playwright).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

process.on("message", async (raw) => {
  const message = raw;
  if (!message || message.type !== "run") {
    process.send?.({ type: "error", message: "bad_message" });
    process.exit(1);
    return;
  }
  if (message.options?.url?.includes("hang")) {
    await new Promise(() => undefined);
    return;
  }
  if (message.options?.url?.includes("boom")) {
    process.send?.({ type: "error", message: "boom_from_child" });
    process.exit(0);
    return;
  }
  const packageRoot = join(message.options.outputDirectory, "child-pkg");
  await mkdir(packageRoot, { recursive: true });
  const manifest = {
    schema_version: "0.1.0",
    capture_run_id: "cap_child_test",
    status: "complete",
    errors: [],
    viewport_captures: [{ name: "desktop" }]
  };
  await writeFile(join(packageRoot, "manifest.json"), JSON.stringify(manifest), "utf8");
  process.send?.({ type: "done", packageRoot });
  setTimeout(() => process.exit(0), 10);
});
