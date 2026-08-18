import assert from "node:assert/strict";
import test from "node:test";
import { catalogHostKey, industryTagsForHost } from "../src/catalog-industry.js";

test("catalog hosts map onto closed industry tags", () => {
  assert.equal(catalogHostKey("https://www.allianz.com/"), "allianz.com");
  assert.deepEqual(industryTagsForHost("https://www.allianz.com/"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://www.toyota.com/"), ["automotive"]);
  assert.ok(industryTagsForHost("https://www.apple.com/").includes("tech"));
  assert.deepEqual(industryTagsForHost(null, "www.axa.com"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://www.random-insurtech.example/"), ["insurance"]);
  assert.deepEqual(industryTagsForHost("https://global.abb/"), ["manufacturing"]);
});
