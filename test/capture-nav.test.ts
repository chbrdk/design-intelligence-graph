import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptLanguageForLocale,
  captureNavConfig,
  detectNavBarrierFromDocument,
  inferCaptureLocale,
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
});

test("shouldUseFirefoxFallback is desktop only", () => {
  assert.equal(shouldUseFirefoxFallback("desktop"), true);
  assert.equal(shouldUseFirefoxFallback("tablet"), false);
  assert.equal(shouldUseFirefoxFallback("mobile"), false);
});
