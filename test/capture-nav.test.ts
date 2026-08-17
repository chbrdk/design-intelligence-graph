import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptLanguageForLocale,
  captureBrowserContextOptions,
  captureNavConfig,
  chromeMajorVersion,
  detectNavBarrierFromDocument,
  hostPlatformKey,
  inferCaptureLocale,
  isHardNavBlock,
  isRetryableHttpStatus,
  shouldUseFirefoxFallback
} from "../src/capture-nav.js";

test("inferCaptureLocale matches host and Europe timezone", () => {
  assert.equal(inferCaptureLocale("https://www.audi.de/", "UTC"), "de-DE");
  assert.equal(inferCaptureLocale("https://www.tesla.com/", "Europe/Berlin"), "de-DE");
  assert.equal(inferCaptureLocale("https://www.tesla.com/", "America/Los_Angeles"), "en-US");
  assert.equal(inferCaptureLocale("https://www.apple.co.uk/iphone", "UTC"), "en-GB");
});

test("acceptLanguageForLocale prefers German for de-*", () => {
  assert.match(acceptLanguageForLocale("de-DE"), /^de-DE/);
  assert.match(acceptLanguageForLocale("en-US"), /en-US/);
});

test("detectNavBarrierFromDocument flags Tesla/Akamai access denied and Cloudflare", () => {
  const denied = detectNavBarrierFromDocument({
    title: "Access Denied",
    bodyText: "You don't have permission to access \"http://www.tesla.com/\" on this server.",
    hasSelector: () => false
  });
  assert.equal(denied.kind, "access_denied");
  assert.equal(denied.isBarrier, true);

  const audi = detectNavBarrierFromDocument({
    title: "Zugriff verweigert",
    bodyText: "Access Denied. Reference #18.abc",
    hasSelector: () => false
  });
  assert.equal(audi.kind, "access_denied");

  const audiWall = detectNavBarrierFromDocument({
    title: "Audi - Site currently not available",
    bodyText: "Our site is currently offline due to maintenance activities. Seite vorübergehend nicht erreichbar. Aufgrund von Wartungsarbeiten ist diese Seite leider vorübergehend nicht erreichbar.",
    hasSelector: () => false
  });
  assert.equal(audiWall.kind, "site_unavailable");
  assert.equal(audiWall.isBarrier, true);
  assert.equal(isHardNavBlock(audiWall.kind), true);

  const cf = detectNavBarrierFromDocument({
    title: "Just a moment...",
    bodyText: "Checking your browser before accessing audi.de",
    hasSelector: () => false
  });
  assert.equal(cf.kind, "waf");

  const turnstile = detectNavBarrierFromDocument({
    title: "Home",
    bodyText: "Welcome",
    hasSelector: (selector) => selector === "#turnstile-wrapper"
  });
  assert.equal(turnstile.kind, "cloudflare");

  const ok = detectNavBarrierFromDocument({
    title: "Audi Deutschland",
    bodyText: "Modelle, Konfigurator, Service",
    hasSelector: () => false
  });
  assert.equal(ok.isBarrier, false);
});

test("retryable HTTP statuses include 403", () => {
  assert.equal(isRetryableHttpStatus(403), true);
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(404), false);
});

test("captureNavConfig reads paths.json", () => {
  const cfg = captureNavConfig();
  assert.equal(cfg.challengeWaitMs, 45_000);
  assert.equal(cfg.maxRetries, 2);
  assert.equal(cfg.retryBaseMs, 1_000);
  assert.equal(cfg.jobTimeoutMs, 60_000);
  assert.equal(cfg.firefoxFallbackViewport, "desktop");
  assert.deepEqual(cfg.libraryListedStatuses, ["complete", "partial"]);
  assert.equal(cfg.geolocation.latitude, 52.52);
  assert.match(cfg.chromiumUserAgentTemplates.linux, /Linux x86_64/);
  assert.equal(cfg.secChUaPlatform.linux, "\"Linux\"");
});

test("shouldUseFirefoxFallback is desktop only", () => {
  assert.equal(shouldUseFirefoxFallback("desktop"), true);
  assert.equal(shouldUseFirefoxFallback("tablet"), false);
  assert.equal(shouldUseFirefoxFallback("mobile"), false);
});

test("captureBrowserContextOptions uses host Chrome UA without HeadlessChrome", () => {
  const desktop = captureBrowserContextOptions({
    viewport: { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
    reducedMotion: "no-preference",
    engine: "chromium",
    browserVersion: "145.0.7632.6",
    platform: "linux"
  });
  assert.equal(desktop.isMobile, false);
  assert.equal(desktop.hasTouch, false);
  assert.match(desktop.userAgent ?? "", /Linux x86_64/);
  assert.match(desktop.userAgent ?? "", /Chrome\/145/);
  assert.doesNotMatch(desktop.userAgent ?? "", /HeadlessChrome/);
  assert.equal(desktop.extraHTTPHeaders?.["sec-ch-ua-mobile"], "?0");
  assert.equal(desktop.extraHTTPHeaders?.["sec-ch-ua-platform"], "\"Linux\"");
  assert.match(desktop.extraHTTPHeaders?.["sec-ch-ua"] ?? "", /"Chromium";v="145"/);
  assert.match(desktop.extraHTTPHeaders?.["Accept-Language"] ?? "", /^de-DE/);
  assert.equal(desktop.geolocation?.latitude, 52.52);

  const mobile = captureBrowserContextOptions({
    viewport: { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
    reducedMotion: "no-preference",
    engine: "chromium",
    browserVersion: "145.0.7632.6",
    platform: "linux"
  });
  assert.equal(mobile.isMobile, true);
  assert.equal(mobile.hasTouch, true);
  assert.equal(mobile.extraHTTPHeaders?.["sec-ch-ua-mobile"], "?1");
  assert.equal(mobile.userAgent, desktop.userAgent);

  const firefox = captureBrowserContextOptions({
    viewport: { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1 },
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
    reducedMotion: "no-preference",
    engine: "firefox",
    browserVersion: "145.0",
    platform: "linux"
  });
  assert.equal(firefox.userAgent, undefined);
  assert.equal(firefox.extraHTTPHeaders?.["sec-ch-ua"], undefined);
});

test("chromeMajorVersion and hostPlatformKey stay coherent", () => {
  assert.equal(chromeMajorVersion("145.0.7632.6"), "145");
  assert.equal(hostPlatformKey("linux"), "linux");
  assert.equal(hostPlatformKey("darwin"), "darwin");
});
