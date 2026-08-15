import assert from "node:assert/strict";
import test from "node:test";
import { screenshotOptions, screenshotSettings } from "../src/screenshot-settings.js";

test("screenshot settings default to webp from knowledge paths", () => {
  const settings = screenshotSettings();
  assert.equal(settings.format, "webp");
  assert.equal(settings.extension, ".webp");
  assert.equal(settings.mediaType, "image/webp");
  assert.ok(settings.quality >= 1 && settings.quality <= 100);
  const options = screenshotOptions(true);
  assert.equal(options.type, "webp");
  assert.equal(options.fullPage, true);
  assert.equal(options.quality, settings.quality);
});
