/**
 * Navigation guard for public captures (CHECKION scan-bot-guard / scan-goto port).
 * Wait out JS challenges; retry 403/Access Denied; do not treat a wall as the site.
 */
import type { Page, Response } from "playwright";
import { loadDigPaths } from "./runtime-paths.js";

export type NavBarrierKind = "none" | "cloudflare" | "waf" | "captcha" | "access_denied";

export type NavBarrierState = {
  isBarrier: boolean;
  kind: NavBarrierKind;
};

const CHALLENGE_PHRASES = [
  "just a moment",
  "checking your browser",
  "verify you are human",
  "attention required",
  "bot verification",
  "security check",
  "ddos protection",
  "enable javascript and cookies"
];

const ACCESS_DENIED_PHRASES = [
  "access denied",
  "access verweigert",
  "zugriff verweigert",
  "you don't have permission to access",
  "pardon our interruption",
  "request unsuccessful",
  "errors.edgesuite.net",
  "the requested url was rejected",
  "your support id is"
];

const CHALLENGE_SELECTORS = [
  "#challenge-form",
  "#cf-challenge-running",
  ".cf-browser-verification",
  'iframe[src*="challenges.cloudflare.com"]',
  "#turnstile-wrapper",
  ".g-recaptcha"
];

export function captureNavConfig(root = process.cwd()): {
  challengeWaitMs: number;
  maxRetries: number;
  retryBaseMs: number;
  jobTimeoutMs: number;
  firefoxFallbackViewport: string;
  libraryListedStatuses: string[];
} {
  const cfg = loadDigPaths(root).captureNav;
  return {
    challengeWaitMs: cfg?.challengeWaitMs ?? 45_000,
    maxRetries: cfg?.maxRetries ?? 2,
    retryBaseMs: cfg?.retryBaseMs ?? 1_000,
    jobTimeoutMs: cfg?.jobTimeoutMs ?? 60_000,
    firefoxFallbackViewport: cfg?.firefoxFallbackViewport ?? "desktop",
    libraryListedStatuses: cfg?.libraryListedStatuses ?? ["complete", "partial"]
  };
}

export function shouldUseFirefoxFallback(viewportName: string, root = process.cwd()): boolean {
  return viewportName === captureNavConfig(root).firefoxFallbackViewport;
}

/** Locale coherent with hostname + capture timezone (Coolify is EU). */
export function inferCaptureLocale(url: string, timezoneId: string): string {
  let host = "";
  try {
    host = new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (host.endsWith(".de")) return "de-DE";
  if (host.endsWith(".at")) return "de-AT";
  if (host.endsWith(".ch")) return "de-CH";
  if (host.endsWith(".fr")) return "fr-FR";
  if (host.endsWith(".it")) return "it-IT";
  if (host.endsWith(".nl")) return "nl-NL";
  if (host.endsWith(".uk") || host.endsWith(".co.uk")) return "en-GB";
  if (timezoneId.startsWith("Europe/")) return "de-DE";
  return "en-US";
}

export function acceptLanguageForLocale(locale: string): string {
  const primary = locale.replace("_", "-");
  const lang = primary.split("-")[0] ?? "en";
  if (lang === "de") return "de-DE,de;q=0.9,en;q=0.8";
  if (lang === "fr") return "fr-FR,fr;q=0.9,en;q=0.8";
  if (lang === "en" && primary.toLowerCase().includes("gb")) return "en-GB,en;q=0.9";
  return `${primary},${lang};q=0.9,en;q=0.8`;
}

export function detectNavBarrierFromDocument(input: {
  title: string;
  bodyText: string;
  hasSelector: (selector: string) => boolean;
}): NavBarrierState {
  const title = input.title.toLowerCase();
  const body = input.bodyText.toLowerCase().slice(0, 4_000);

  for (const selector of CHALLENGE_SELECTORS) {
    if (input.hasSelector(selector)) return { isBarrier: true, kind: "cloudflare" };
  }

  for (const phrase of ACCESS_DENIED_PHRASES) {
    if (title.includes(phrase) || body.includes(phrase)) {
      return { isBarrier: true, kind: "access_denied" };
    }
  }

  for (const phrase of CHALLENGE_PHRASES) {
    if (title.includes(phrase) || body.includes(phrase)) {
      return { isBarrier: true, kind: "waf" };
    }
  }

  if (body.includes("cloudflare") && (body.includes("ray id") || body.includes("cf-ray"))) {
    return { isBarrier: true, kind: "cloudflare" };
  }

  return { isBarrier: false, kind: "none" };
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 403 || status === 429 || status === 502 || status === 503;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detectOnPage(page: Page): Promise<NavBarrierState> {
  try {
    return (await page.evaluate((selectors: string[]) => {
      const title = document.title || "";
      const bodyText = document.body?.innerText || "";
      const hasSelector = (selector: string) => Boolean(document.querySelector(selector));
      const titleL = title.toLowerCase();
      const bodyL = bodyText.toLowerCase().slice(0, 4_000);
      for (const selector of selectors) {
        if (hasSelector(selector)) return { isBarrier: true, kind: "cloudflare" as const };
      }
      const denied = [
        "access denied",
        "access verweigert",
        "zugriff verweigert",
        "you don't have permission to access",
        "pardon our interruption",
        "request unsuccessful",
        "errors.edgesuite.net",
        "the requested url was rejected",
        "your support id is"
      ];
      for (const phrase of denied) {
        if (titleL.includes(phrase) || bodyL.includes(phrase)) {
          return { isBarrier: true, kind: "access_denied" as const };
        }
      }
      const challenges = [
        "just a moment",
        "checking your browser",
        "verify you are human",
        "attention required",
        "bot verification",
        "security check",
        "ddos protection",
        "enable javascript and cookies"
      ];
      for (const phrase of challenges) {
        if (titleL.includes(phrase) || bodyL.includes(phrase)) {
          return { isBarrier: true, kind: "waf" as const };
        }
      }
      if (bodyL.includes("cloudflare") && (bodyL.includes("ray id") || bodyL.includes("cf-ray"))) {
        return { isBarrier: true, kind: "cloudflare" as const };
      }
      return { isBarrier: false, kind: "none" as const };
    }, CHALLENGE_SELECTORS)) as NavBarrierState;
  } catch {
    return { isBarrier: false, kind: "none" };
  }
}

async function waitForChallengeClear(page: Page, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  let saw = false;
  while (Date.now() - started < timeoutMs) {
    const state = await detectOnPage(page);
    if (!state.isBarrier || state.kind === "access_denied") {
      return !saw || Date.now() - started > 1_500;
    }
    saw = true;
    await sleep(2_000);
  }
  return false;
}

export type GuardedGotoResult = {
  response: Response | null;
  warnings: string[];
  barrier: NavBarrierState;
  blocked: boolean;
};

export async function gotoWithNavGuard(
  page: Page,
  url: string,
  timeoutMs: number,
  config = captureNavConfig()
): Promise<GuardedGotoResult> {
  const warnings: string[] = [];
  let lastResponse: Response | null = null;
  let lastBarrier: NavBarrierState = { isBarrier: false, kind: "none" };

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    if (attempt > 0) {
      const backoff = config.retryBaseMs * attempt;
      warnings.push(`nav_retry:${attempt + 1}:backoff_ms:${backoff}`);
      await sleep(backoff);
    }

    try {
      lastResponse = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`nav_goto_failed:${message}`);
      if (attempt < config.maxRetries - 1) continue;
      return {
        response: lastResponse,
        warnings,
        barrier: lastBarrier,
        blocked: lastBarrier.kind === "access_denied"
      };
    }

    const status = lastResponse?.status() ?? 0;
    if (status && !lastResponse?.ok()) warnings.push(`navigation_http_${status}`);

    lastBarrier = await detectOnPage(page);
    if (lastBarrier.isBarrier && lastBarrier.kind !== "access_denied") {
      warnings.push(`nav_challenge:${lastBarrier.kind}:wait`);
      const cleared = await waitForChallengeClear(page, config.challengeWaitMs);
      lastBarrier = await detectOnPage(page);
      if (cleared && !lastBarrier.isBarrier) {
        warnings.push("nav_challenge_resolved");
        return { response: lastResponse, warnings, barrier: lastBarrier, blocked: false };
      }
    }

    if (!lastBarrier.isBarrier && status < 400) {
      if (attempt > 0) warnings.push("nav_recovered_after_retry");
      return { response: lastResponse, warnings, barrier: lastBarrier, blocked: false };
    }

    if (lastBarrier.kind === "access_denied" || isRetryableHttpStatus(status)) {
      warnings.push(`nav_barrier:${lastBarrier.kind || status}:attempt_${attempt + 1}`);
      if (attempt < config.maxRetries - 1) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => undefined);
        continue;
      }
    }
  }

  const blocked = lastBarrier.kind === "access_denied" || (lastResponse?.status() ?? 0) === 403;
  if (blocked) warnings.push(`nav_blocked:${lastBarrier.kind}`);
  return { response: lastResponse, warnings, barrier: lastBarrier, blocked };
}
