import assert from "node:assert/strict";
import test from "node:test";
import {
  libraryCardScreenshotPath,
  libraryFullPageScreenshotPath,
  playwrightFullPagePathBesideCheckion
} from "../src/library-screenshot.js";
import { cookieConsentConfig } from "../src/runtime-paths.js";

test("cookieConsentConfig reads retries and Sourcepoint iframe pattern from paths.json", () => {
  const cfg = cookieConsentConfig();
  assert.equal(cfg.retries, 3);
  assert.equal(cfg.checkionFullPageSuffix, "checkion-full-page.jpg");
  assert.match(cfg.iframeUrlPattern, /privacy-mgmt/);
});

test("playwrightFullPagePathBesideCheckion swaps CHECKION JPEG for DIG webp", () => {
  const next = playwrightFullPagePathBesideCheckion(
    "viewports/desktop/screenshots/checkion-full-page.jpg"
  );
  assert.equal(next, "viewports/desktop/screenshots/full-page.webp");
});

test("library cards prefer DIG playwright shot over CHECKION JPEG", () => {
  assert.equal(
    libraryFullPageScreenshotPath({
      playwright_full_page_screenshot: { path: "viewports/desktop/screenshots/full-page.webp" },
      full_page_screenshot: { path: "viewports/desktop/screenshots/checkion-full-page.jpg" }
    }),
    "viewports/desktop/screenshots/full-page.webp"
  );
  assert.equal(
    libraryCardScreenshotPath({
      full_page_screenshot_path: "viewports/desktop/screenshots/checkion-full-page.jpg",
      settled_screenshot_path: "viewports/desktop/screenshots/settled.webp"
    }),
    "viewports/desktop/screenshots/full-page.webp"
  );
  assert.equal(
    libraryCardScreenshotPath({
      full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp"
    }),
    "viewports/desktop/screenshots/full-page.webp"
  );
});
