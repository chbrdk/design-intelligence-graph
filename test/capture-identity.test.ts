import assert from "node:assert/strict";
import test from "node:test";
import { captureIdentityKey, filterExistingCaptureUrls, uniqueCaptureUrls } from "../src/capture-identity.js";

test("captureIdentityKey collapses www, trailing slash, and hash", () => {
  assert.equal(captureIdentityKey("https://www.siemens.com/"), "siemens.com");
  assert.equal(captureIdentityKey("https://siemens.com/#x"), "siemens.com");
  assert.equal(captureIdentityKey("https://www.siemens.com/global"), "siemens.com/global");
});

test("filterExistingCaptureUrls skips indexed hosts and intra-batch duplicates", () => {
  const result = filterExistingCaptureUrls(
    [
      "https://www.asml.com/",
      "https://asml.com/",
      "https://www.caterpillar.com/",
      "https://www.siemens.com/"
    ],
    ["https://siemens.com/"]
  );
  assert.deepEqual(result.urls, ["https://www.asml.com/", "https://www.caterpillar.com/"]);
  assert.equal(result.skippedExisting, 1);
  assert.equal(result.skippedDuplicate, 1);
});

test("uniqueCaptureUrls drops empty and duplicate hosts", () => {
  const result = uniqueCaptureUrls(["https://a.com/", "https://www.a.com/", ""]);
  assert.deepEqual(result.urls, ["https://a.com/"]);
  assert.equal(result.skippedDuplicate, 1);
});
