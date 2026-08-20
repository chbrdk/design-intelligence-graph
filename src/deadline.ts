/**
 * Deadlines and forced Playwright browser teardown for hung captures.
 */
import type { Browser } from "playwright";

export class DeadlineError extends Error {
  readonly code = "hard_timeout";
  readonly timeoutMs: number;

  constructor(timeoutMs: number, label = "operation") {
    super(`${label}_hard_timeout_${timeoutMs}ms`);
    this.name = "DeadlineError";
    this.timeoutMs = timeoutMs;
  }
}

export function throwIfAborted(signal?: AbortSignal, label = "capture"): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new Error(`${label}_aborted`);
}

/** Race `work` against a hard wall clock; call `onExpire` when the timer wins (e.g. abort + kill browser). */
export async function withDeadline<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  onExpire?: () => void,
  label = "operation"
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return work();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const workPromise = work();
  // Avoid unhandledRejection if work settles after the deadline already won.
  void workPromise.catch(() => undefined);
  try {
    return await Promise.race([
      workPromise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onExpire?.();
          } catch {
            /* ignore expire side effects */
          }
          reject(new DeadlineError(timeoutMs, label));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Close a Playwright browser; SIGKILL the child if close hangs. */
export async function forceCloseBrowser(browser: Browser | undefined, closeTimeoutMs = 8_000): Promise<void> {
  if (!browser) return;
  // Playwright Chromium exposes process(); typings omit it on the Browser union.
  const withProcess = browser as Browser & { process?: () => { kill: (signal?: NodeJS.Signals) => boolean } | null };
  const child = typeof withProcess.process === "function" ? withProcess.process() : null;
  try {
    await withDeadline(() => browser.close(), closeTimeoutMs, () => {
      try {
        child?.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, "browser_close");
  } catch {
    try {
      child?.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}
