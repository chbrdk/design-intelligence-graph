import assert from "node:assert/strict";
import test from "node:test";
import { buildHotspotsFromSection } from "../src/library-api.js";

test("hotspots normalize against document height for full-page media", () => {
  const hotspots = buildHotspotsFromSection({
    section_id: "sec_1",
    category: "content",
    signature: "media",
    root_box: { x: 0, y: 2000, width: 1440, height: 800 },
    recipe: [],
    viewport_width: 1440,
    viewport_height: 1000,
    document_width: 1440,
    document_height: 5000
  });
  assert.equal(hotspots[0]?.normalized?.y, 2000 / 5000);
  assert.equal(hotspots[0]?.normalized?.height, 800 / 5000);
});
