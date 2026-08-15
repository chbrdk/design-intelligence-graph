import assert from "node:assert/strict";
import test from "node:test";
import { handleLibraryApi } from "../src/library-api.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function mockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body = "";
  const response = {
    writeHead(status: number, nextHeaders?: Record<string, string>) {
      statusCode = status;
      Object.assign(headers, nextHeaders ?? {});
      return response;
    },
    end(payload?: string) {
      body = payload ?? "";
      return response;
    },
    write() {
      return true;
    }
  } as unknown as ServerResponse;
  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    }
  };
}

test("library API returns 503 when database is unavailable", async () => {
  const mock = mockResponse();
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/captures"),
    null
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 503);
  assert.match(mock.body, /database_unavailable/);
});

test("library API lists captures via injectable queryable", async () => {
  const mock = mockResponse();
  const client = {
    async query() {
      return {
        rows: [
          {
            capture_run_id: "cap_test",
            package_path: "/tmp/pkg",
            requested_url: "https://example.com",
            canonical_url: "https://example.com/",
            status: "complete",
            site_domain: "example.com",
            page_route: "/",
            quality_overall: 0.9,
            quality_rating: "good",
            started_at: null,
            completed_at: null,
            indexed_at: new Date().toISOString()
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/captures"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  assert.match(mock.body, /cap_test/);
});

test("buildHotspotsFromSection normalizes boxes", async () => {
  const { buildHotspotsFromSection } = await import("../src/library-api.js");
  const hotspots = buildHotspotsFromSection({
    section_id: "sec_1",
    category: "hero",
    signature: "media>heading",
    root_box: { x: 0, y: 0, width: 720, height: 400 },
    viewport_width: 1440,
    viewport_height: 900,
    recipe: [
      { kind: "role", role: "heading", box: { x: 100, y: 50, width: 200, height: 40 } },
      { kind: "gap", gap_px: 12 }
    ]
  });
  assert.equal(hotspots.length, 2);
  assert.equal(hotspots[0]?.role, "section");
  assert.deepEqual(hotspots[0]?.normalized, { x: 0, y: 0, width: 0.5, height: 400 / 900 });
  assert.equal(hotspots[1]?.role, "heading");
});

test("library API returns flows with matched sections", async () => {
  const mock = mockResponse();
  const client = {
    async query(sql: string) {
      if (/kind = 'page_flow'/i.test(sql)) {
        return {
          rows: [{ id: 1, section_label: "Hero", signature: "media>heading>cta", step_index: 1, evidence_refs: [] }]
        };
      }
      return {
        rows: [
          {
            section_id: "sec_1",
            category: "hero",
            signature: "media>heading>cta",
            taxonomy_id: "dig:section.hero_media_above",
            confidence: 0.9,
            viewport_name: "desktop"
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/flows?capture_run_id=cap_test"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as { steps: Array<{ matched_section: { section_id: string } | null }> };
  assert.equal(body.steps[0]?.matched_section?.section_id, "sec_1");
});

test("library API screen detail includes hotspots", async () => {
  const mock = mockResponse();
  let call = 0;
  const client = {
    async query() {
      call += 1;
      if (call === 1) {
        return {
          rows: [
            {
              id: 1,
              capture_run_id: "cap_test",
              viewport_capture_id: "vpc_1",
              name: "desktop",
              status: "complete",
              width: 1440,
              height: 900,
              title: "Example",
              settled_screenshot_path: "viewports/desktop/screenshots/settled.webp",
              full_page_screenshot_path: null,
              canonical_url: "https://example.com/",
              site_domain: "example.com",
              package_path: "/tmp/pkg"
            }
          ]
        };
      }
      return {
        rows: [
          {
            section_id: "sec_1",
            category: "hero",
            signature: "media>heading",
            recipe: [{ kind: "role", role: "cta", box: { x: 10, y: 10, width: 40, height: 20 } }],
            root_box: { x: 0, y: 0, width: 100, height: 80 },
            viewport_width: 1440,
            viewport_height: 900,
            confidence: 0.9
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/screens/vpc_1"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as { hotspots: unknown[]; screen: { settled_url: string } };
  assert.ok(body.hotspots.length >= 2);
  assert.match(body.screen.settled_url, /settled\.webp/);
});

test("library API creates collections", async () => {
  const mock = mockResponse();
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      statements.push(sql);
      return { rows: [] };
    }
  };
  const request = {
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ name: "Apple CTAs" }));
    }
  } as unknown as IncomingMessage;
  const handled = await handleLibraryApi(
    request,
    mock.response,
    new URL("http://127.0.0.1/api/library/collections"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 201);
  assert.ok(statements.some((sql) => /INSERT INTO collections/i.test(sql)));
  assert.match(mock.body, /Apple CTAs/);
});

test("library API search uses embeddings query", async () => {
  const mock = mockResponse();
  const client = {
    async query(sql: string) {
      assert.match(sql, /embeddings/i);
      return {
        rows: [
          {
            capture_run_id: "cap_test",
            subject_kind: "section",
            subject_id: "sec_1",
            content_text: "hero media heading",
            model: "dig-hashing-v1",
            site_domain: "example.com",
            canonical_url: "https://example.com/",
            score: 0.9
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/search?q=hero%20cta"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  assert.match(mock.body, /sec_1/);
});

test("library API lists design nodes", async () => {
  const mock = mockResponse();
  const client = {
    async query() {
      return {
        rows: [
          {
            id: 1,
            capture_run_id: "cap_test",
            taxonomy_id: "dig:component.button",
            label: "Button",
            entity_type: "component",
            text_preview: "Buy",
            confidence: 0.9,
            box: null
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/nodes?taxonomy_id=dig:component.button"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  assert.match(mock.body, /Button/);
});
