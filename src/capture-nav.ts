/**
 * Navigation guard for public captures (CHECKION scan-bot-guard / scan-goto port).
 * Wait out JS challenges; retry 403/Access Denied; do not treat a wall as the site.
 */
import type { BrowserContextOptions, Page, Response } from "playwright";
import { loadDigPaths } from "./runtime-paths.js";

export type NavBarrierKind =
  | "none"
  | "cloudflare"
  | "waf"
  | "captcha"
  | "access_denied"
  | "site_unavailable";

export type NavBarrierState = {
  isBarrier: boolean;
  kind: NavBarrierKind;
};

export type CaptureEngine = "chromium" | "firefox" | "webkit";

export type HostPlatformKey = "linux" | "darwin" | "win32";

export type NavGuardLoopConfig = {
  challengeWaitMs: number;
  maxRetries: number;
  retryBaseMs: number;
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

/** OneAudi / Akamai interstitial that looks like downtime. */
const SITE_UNAVAILABLE_PHRASES = [
  "site currently not available",
  "seite vorübergehend nicht erreichbar",
  "seite derzeit nicht verfügbar",
  "our site is currently offline due to maintenance",
  "aufgrund von wartungsarbeiten"
];

const CHALLENGE_SELECTORS = [
  "#challenge-form",
  "#cf-challenge-running",
  ".cf-browser-verification",
  'iframe[src*="challenges.cloudflare.com"]',
  "#turnstile-wrapper",
  ".g-recaptcha"
];

const DEFAULT_UA_TEMPLATES: Record<HostPlatformKey, string> = {
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{{major}}.0.0.0 Safari/537.36",
  darwin: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{{major}}.0.0.0 Safari/537.36",
  win32: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{{major}}.0.0.0 Safari/537.36"
};

const DEFAULT_CH_PLATFORM: Record<HostPlatformKey, string> = {
  linux: "\"Linux\"",
  darwin: "\"macOS\"",
  win32: "\"Windows\""
};

export function captureNavConfig(root = process.cwd()): {
  challengeWaitMs: number;
  maxRetries: number;
  retryBaseMs: number;
  jobTimeoutMs: number;
  firefoxFallbackViewport: string;
  libraryListedStatuses: string[];
  geolocation: { latitude: number; longitude: number };
  acceptHeader: string;
  secChUaTemplate: string;
  chromiumUserAgentTemplates: Record<HostPlatformKey, string>;
  secChUaPlatform: Record<HostPlatformKey, string>;
} {
  const cfg = loadDigPaths(root).captureNav;
  return {
    challengeWaitMs: cfg?.challengeWaitMs ?? 45_000,
    maxRetries: cfg?.maxRetries ?? 2,
    retryBaseMs: cfg?.retryBaseMs ?? 1_000,
    jobTimeoutMs: cfg?.jobTimeoutMs ?? 60_000,
    firefoxFallbackViewport: cfg?.firefoxFallbackViewport ?? "desktop",
    libraryListedStatuses: cfg?.libraryListedStatuses ?? ["complete", "partial"],
    geolocation: cfg?.geolocation ?? { latitude: 52.52, longitude: 13.405 },
    acceptHeader: cfg?.acceptHeader
      ?? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    secChUaTemplate: cfg?.secChUaTemplate
      ?? "\"Chromium\";v=\"{{major}}\", \"Not:A-Brand\";v=\"24\", \"Google Chrome\";v=\"{{major}}\"",
    chromiumUserAgentTemplates: {
      linux: cfg?.chromiumUserAgentTemplates?.linux ?? DEFAULT_UA_TEMPLATES.linux,
      darwin: cfg?.chromiumUserAgentTemplates?.darwin ?? DEFAULT_UA_TEMPLATES.darwin,
      win32: cfg?.chromiumUserAgentTemplates?.win32 ?? DEFAULT_UA_TEMPLATES.win32
    },
    secChUaPlatform: {
      linux: cfg?.secChUaPlatform?.linux ?? DEFAULT_CH_PLATFORM.linux,
      darwin: cfg?.secChUaPlatform?.darwin ?? DEFAULT_CH_PLATFORM.darwin,
      win32: cfg?.secChUaPlatform?.win32 ?? DEFAULT_CH_PLATFORM.win32
    }
  };
}

export function isHardNavBlock(kind: NavBarrierKind): boolean {
  return kind === "access_denied" || kind === "site_unavailable";
}

export function chromeMajorVersion(browserVersion: string): string {
  return browserVersion.match(/^(\d+)/)?.[1] ?? "131";
}

export function hostPlatformKey(platform?: string): HostPlatformKey {
  const value = platform ?? process.platform;
  if (value === "darwin" || value === "win32") return value;
  return "linux";
}

function applyMajor(template: string, major: string): string {
  return template.replaceAll("{{major}}", major);
}

/** Coherent Chromium identity for the host OS — never HeadlessChrome, never a fake Windows UA on Linux. */
export function captureBrowserContextOptions(input: {
  viewport: { name: string; width: number; height: number; deviceScaleFactor: number };
  locale: string;
  timezoneId: string;
  colorScheme: "light" | "dark";
  reducedMotion: "reduce" | "no-preference";
  engine: CaptureEngine;
  browserVersion: string;
  platform?: string;
  root?: string;
}): BrowserContextOptions {
  const cfg = captureNavConfig(input.root);
  const isMobile = input.viewport.name === "mobile";
  const hasTouch = input.viewport.name !== "desktop";
  const extraHTTPHeaders: Record<string, string> = {
    "Accept-Language": acceptLanguageForLocale(input.locale),
    Accept: cfg.acceptHeader
  };

  const options: BrowserContextOptions = {
    viewport: { width: input.viewport.width, height: input.viewport.height },
    deviceScaleFactor: input.viewport.deviceScaleFactor,
    locale: input.locale,
    timezoneId: input.timezoneId,
    colorScheme: input.colorScheme,
    reducedMotion: input.reducedMotion,
    extraHTTPHeaders,
    hasTouch,
    isMobile,
    geolocation: cfg.geolocation,
    permissions: ["geolocation"]
  };

  if (input.engine !== "chromium") return options;

  const platform = hostPlatformKey(input.platform);
  const major = chromeMajorVersion(input.browserVersion);
  options.userAgent = applyMajor(cfg.chromiumUserAgentTemplates[platform], major);
  extraHTTPHeaders["sec-ch-ua"] = applyMajor(cfg.secChUaTemplate, major);
  extraHTTPHeaders["sec-ch-ua-mobile"] = isMobile ? "?1" : "?0";
  extraHTTPHeaders["sec-ch-ua-platform"] = cfg.secChUaPlatform[platform];
  extraHTTPHeaders["Upgrade-Insecure-Requests"] = "1";
  return options;
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

  for (const phrase of SITE_UNAVAILABLE_PHRASES) {
    if (title.includes(phrase) || body.includes(phrase)) {
      return { isBarrier: true, kind: "site_unavailable" };
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
    const snapshot = await page.evaluate((selectors: string[]) => ({
      title: document.title || "",
      bodyText: document.body?.innerText || "",
      present: selectors.filter((selector) => Boolean(document.querySelector(selector)))
    }), CHALLENGE_SELECTORS);
    const present = new Set(snapshot.present);
    return detectNavBarrierFromDocument({
      title: snapshot.title,
      bodyText: snapshot.bodyText,
      hasSelector: (selector) => present.has(selector)
    });
  } catch {
    return { isBarrier: false, kind: "none" };
  }
}

async function waitForChallengeClear(page: Page, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  let saw = false;
  while (Date.now() - started < timeoutMs) {
    const state = await detectOnPage(page);
    if (!state.isBarrier || isHardNavBlock(state.kind)) {
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
  config: NavGuardLoopConfig = captureNavConfig()
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
        blocked: isHardNavBlock(lastBarrier.kind)
      };
    }

    const status = lastResponse?.status() ?? 0;
    if (status && !lastResponse?.ok()) warnings.push(`navigation_http_${status}`);

    lastBarrier = await detectOnPage(page);
    if (lastBarrier.isBarrier && !isHardNavBlock(lastBarrier.kind)) {
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

    if (isHardNavBlock(lastBarrier.kind) || isRetryableHttpStatus(status)) {
      warnings.push(`nav_barrier:${lastBarrier.kind || status}:attempt_${attempt + 1}`);
      if (attempt < config.maxRetries - 1) {
        await page.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs }).catch(() => undefined);
        continue;
      }
    }
  }

  const blocked = isHardNavBlock(lastBarrier.kind) || (lastResponse?.status() ?? 0) === 403;
  if (blocked) warnings.push(`nav_blocked:${lastBarrier.kind}`);
  return { response: lastResponse, warnings, barrier: lastBarrier, blocked };
}
