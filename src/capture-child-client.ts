/**
 * Fork a one-shot capture child so Playwright cannot wedge the dig-api event loop.
 */
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CaptureChildResultMessage, CaptureChildRunMessage } from "./capture-child.js";
import type { CaptureManifest, CaptureOptions } from "./types.js";

export type CaptureChildClientOptions = {
  signal?: AbortSignal;
  /** Test seam. */
  forkFn?: typeof fork;
  /** Test seam — override worker script path. */
  scriptPath?: string;
};

function resolveCaptureChildScript(override?: string): string {
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url));
  const asJs = join(here, "capture-child.js");
  if (existsSync(asJs)) return asJs;
  const asTs = join(here, "capture-child.ts");
  if (existsSync(asTs)) return asTs;
  throw new Error("capture_child_script_missing");
}

function killChild(child: ChildProcess): void {
  if (child.killed || child.exitCode !== null) return;
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}

async function readManifest(packageRoot: string): Promise<CaptureManifest> {
  const raw = await readFile(join(packageRoot, "manifest.json"), "utf8");
  return JSON.parse(raw) as CaptureManifest;
}

/**
 * Run `capture()` in a forked Node process. On abort the child is SIGKILL'd
 * (including its Chromium tree).
 */
export async function runCaptureInChild(
  options: Omit<CaptureOptions, "signal">,
  client: CaptureChildClientOptions = {}
): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
  const script = resolveCaptureChildScript(client.scriptPath);
  const forkFn = client.forkFn ?? fork;
  const execArgv = script.endsWith(".ts")
    ? ["--import", "tsx"]
    : process.execArgv.filter((arg) => !(arg === "--import" || arg === "tsx"));

  return new Promise<{ packageRoot: string; manifest: CaptureManifest }>((resolve, reject) => {
    let settled = false;
    let acceptExit = false;
    const child = forkFn(script, [], {
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      execArgv
    });

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      client.signal?.removeEventListener("abort", onAbort);
      child.removeAllListeners();
      fn();
    };

    const onAbort = () => {
      killChild(child);
      settle(() =>
        reject(
          client.signal?.reason instanceof Error
            ? client.signal.reason
            : new Error("capture_child_aborted")
        )
      );
    };

    if (client.signal) {
      if (client.signal.aborted) {
        onAbort();
        return;
      }
      client.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (error) => {
      killChild(child);
      settle(() => reject(error));
    });

    child.on("exit", (code, signalName) => {
      if (settled || acceptExit) return;
      settle(() =>
        reject(new Error(`capture_child_exit_code_${code ?? "null"}_signal_${signalName ?? "null"}`))
      );
    });

    child.on("message", (raw: unknown) => {
      const message = raw as CaptureChildResultMessage;
      if (!message || typeof message !== "object") return;
      if (message.type === "error") {
        killChild(child);
        settle(() => reject(new Error(message.message || "capture_child_error")));
        return;
      }
      if (message.type === "done") {
        acceptExit = true;
        void readManifest(message.packageRoot)
          .then((manifest) => {
            settle(() => resolve({ packageRoot: message.packageRoot, manifest }));
          })
          .catch((error: unknown) => {
            killChild(child);
            settle(() => reject(error instanceof Error ? error : new Error(String(error))));
          });
      }
    });

    const payload: CaptureChildRunMessage = { type: "run", options };
    try {
      child.send(payload);
    } catch (error: unknown) {
      killChild(child);
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

export function captureViaChildOrInProcess(
  options: CaptureOptions
): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
  if (process.env.DIG_CAPTURE_IN_PROCESS === "1") {
    return import("./capture.js").then(({ capture }) => capture(options));
  }
  const { signal, ...rest } = options;
  return runCaptureInChild(rest, signal ? { signal } : {});
}
