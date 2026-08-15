import assert from "node:assert/strict";
import test from "node:test";
import { createPageIdentity, createSiteIdentity } from "../src/identity.js";

test("creates stable site and page identities", () => {
  const site = createSiteIdentity("https://www.example.com/path");
  const repeated = createSiteIdentity("https://www.example.com/other");
  assert.equal(site.site_id, repeated.site_id);
  assert.equal(site.canonical_origin, "https://www.example.com");
  const page = createPageIdentity("https://www.example.com/path", site.site_id);
  assert.equal(page.site_id, site.site_id);
  assert.equal(page.route, "/path");
  assert.match(page.page_id, /^pg_[a-f0-9]{20}$/);
});
