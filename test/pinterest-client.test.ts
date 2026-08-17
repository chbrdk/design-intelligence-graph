import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedPinImageHost,
  parsePinterestPin,
  pickLargestPinImage,
  pinPageUrl
} from "../src/pinterest-client.js";

test("pickLargestPinImage prefers originals and rejects off-host URLs", () => {
  const picked = pickLargestPinImage({
    media_type: "image",
    images: {
      "150x150": { url: "https://i.pinimg.com/150x150/a.jpg", width: 150, height: 150 },
      originals: { url: "https://i.pinimg.com/originals/a.jpg", width: 1200, height: 1800 }
    }
  });
  assert.equal(picked?.url, "https://i.pinimg.com/originals/a.jpg");
  assert.equal(picked?.width, 1200);
  assert.equal(isAllowedPinImageHost("https://evil.example/x.jpg"), false);
  assert.equal(isAllowedPinImageHost("http://i.pinimg.com/a.jpg"), false);
  assert.equal(pinPageUrl("123"), "https://www.pinterest.com/pin/123/");
});

test("parsePinterestPin skips pins without an allowed image", () => {
  const skipped = parsePinterestPin({
    id: "pin_1",
    title: "Mood",
    media: { images: { originals: { url: "https://cdn.example.com/x.jpg", width: 10, height: 10 } } }
  });
  assert.equal(skipped?.id, "pin_1");
  assert.equal(skipped?.image, null);
  const ok = parsePinterestPin({
    id: "pin_2",
    title: "Hero",
    media: { images: { originals: { url: "https://i.pinimg.com/x.jpg", width: 400, height: 600 } } }
  });
  assert.equal(ok?.image?.url, "https://i.pinimg.com/x.jpg");
});
