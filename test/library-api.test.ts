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

test("library API returns page-flows with matched sections", async () => {
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
    new URL("http://127.0.0.1/api/library/page-flows?capture_run_id=cap_test"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as { steps: Array<{ matched_section: { section_id: string } | null }> };
  assert.equal(body.steps[0]?.matched_section?.section_id, "sec_1");
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

test("library API lists DIG-011 flows without database", async () => {
  const mock = mockResponse();
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/flows"),
    null
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as { items: unknown[] };
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length >= 1);
});

test("library API flow seed requires domain_scan_id and app_scope_id", async () => {
  async function* emptyBody() {
    /* no chunks */
  }
  const mock = mockResponse();
  const handled = await handleLibraryApi(
    { method: "POST", headers: {}, [Symbol.asyncIterator]: emptyBody } as unknown as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/flows/seed"),
    { async query() { return { rows: [] }; } }
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 400);
  assert.match(mock.body, /domain_scan_id/);
});

test("library API lists DIG-011 flows and returns detail", async () => {
  const { setFlowLibraryStoreForTests } = await import("../src/flow-library.js");
  const graph = {
    flow_schema_version: "0.1.0" as const,
    flow_id: "flow_lib_test",
    app_scope_id: "app_fixture_shop",
    flow_session_id: null,
    title: "Lib test",
    flow_actions: [
      { taxonomy_id: "dig:flow.logging_in", confidence: 0.9, method: "path_ontology_rule", layer: "L2" as const }
    ],
    screens: [
      {
        flow_screen_id: "fs_home",
        order: 0,
        capture_run_id: "run_home",
        checkion_scan_id: null,
        primary_url: "https://shop.example/home"
      }
    ],
    edges: []
  };
  setFlowLibraryStoreForTests([graph]);
  try {
    const listMock = mockResponse();
    const listed = await handleLibraryApi(
      { method: "GET" } as IncomingMessage,
      listMock.response,
      new URL("http://127.0.0.1/api/library/flows?flow_action=dig:flow.logging_in"),
      { async query() { return { rows: [] }; } }
    );
    assert.equal(listed, true);
    assert.equal(listMock.statusCode, 200);
    const listBody = JSON.parse(listMock.body) as { items: Array<{ flow_id: string }> };
    assert.ok(listBody.items.some((item) => item.flow_id === "flow_lib_test"));

    const detailMock = mockResponse();
    const detailed = await handleLibraryApi(
      { method: "GET" } as IncomingMessage,
      detailMock.response,
      new URL("http://127.0.0.1/api/library/flows/flow_lib_test"),
      { async query() { return { rows: [] }; } }
    );
    assert.equal(detailed, true);
    assert.equal(detailMock.statusCode, 200);
    const detailBody = JSON.parse(detailMock.body) as { flow: { flow_id: string } };
    assert.equal(detailBody.flow.flow_id, "flow_lib_test");
  } finally {
    setFlowLibraryStoreForTests(null);
  }
});

test("library API screen detail prefers vision_layout hotspots", async () => {
  const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "dig-vision-layout-"));
  await mkdir(join(root, "derived"), { recursive: true });
  await writeFile(
    join(root, "derived/vision-layout.json"),
    JSON.stringify({
      schema_version: "0.1.0",
      vision_layout_version: "0.1.0",
      generated_at: new Date().toISOString(),
      source_screenshot: "viewports/desktop/screenshots/full-page.webp",
      image_width: 1200,
      image_height: 4000,
      status: "complete",
      bands: [
        {
          id: "band_hero",
          label: "Hero",
          category: "hero",
          box: { x: 0, y: 0, width: 1, height: 0.2 },
          confidence: 0.9
        }
      ]
    }),
    "utf8"
  );

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
              capture_run_id: "cap_vision",
              viewport_capture_id: "vpc_vision",
              name: "desktop",
              status: "complete",
              width: 1440,
              height: 900,
              title: "Vision",
              settled_screenshot_path: "viewports/desktop/screenshots/settled.webp",
              full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp",
              document_width: 1440,
              document_height: 5000,
              canonical_url: "https://example.com/",
              site_domain: "example.com",
              package_path: root
            }
          ]
        };
      }
      return {
        rows: [
          {
            section_id: "sec_dom",
            category: "commerce",
            signature: "body",
            recipe: [],
            root_box: { x: 0, y: 0, width: 100, height: 80 },
            viewport_width: 1440,
            viewport_height: 900,
            confidence: 0.5
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/screens/vpc_vision"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as {
    hotspots: Array<{ section_id: string; normalized: { y: number; height: number } | null }>;
    vision_layout: { band_count: number } | null;
  };
  assert.equal(body.vision_layout?.band_count, 1);
  assert.equal(body.hotspots[0]?.section_id, "band_hero");
  assert.ok(body.hotspots[0]?.normalized);
  assert.equal(body.hotspots[0]?.normalized?.y, 0);
});

test("library API screen detail uses vision hotspots only (no DOM fallback)", async () => {
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
              full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp",
              document_width: 1440,
              document_height: 5000,
              canonical_url: "https://example.com/",
              site_domain: "example.com",
              package_path: "/tmp/pkg-missing-vision"
            }
          ]
        };
      }
      return { rows: [] };
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
  const body = JSON.parse(mock.body) as {
    hotspots: unknown[];
    screen: { settled_url: string; full_page_url: string; primary_url: string };
  };
  assert.equal(body.hotspots.length, 0);
  assert.match(body.screen.settled_url, /settled\.webp/);
  assert.match(body.screen.full_page_url, /full-page\.webp/);
  assert.match(body.screen.primary_url, /full-page\.webp/);
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

test("library API lists analyses", async () => {
  const mock = mockResponse();
  const client = {
    async query(sql: string) {
      assert.match(sql, /llm_analyses/i);
      return {
        rows: [
          {
            capture_run_id: "cap_llm",
            model: "qwen",
            status: "ok",
            analysis_mode: "staged",
            design_summary: "Hero-led marketing page",
            hypothesis_count: 2,
            generated_at: new Date().toISOString(),
            raw_response_sha256: "abc",
            site_domain: "example.com",
            canonical_url: "https://example.com/",
            package_path: "/tmp/pkg"
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/analyses"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as { analyses: Array<{ capture_run_id: string }> };
  assert.equal(body.analyses[0]?.capture_run_id, "cap_llm");
});

test("library API analysis detail groups items", async () => {
  const mock = mockResponse();
  let call = 0;
  const client = {
    async query(sql: string) {
      call += 1;
      if (call === 1) {
        assert.match(sql, /llm_analyses/i);
        return {
          rows: [
            {
              capture_run_id: "cap_llm",
              model: "qwen",
              base_url: null,
              status: "ok",
              analysis_mode: "staged",
              design_summary: "Summary",
              hypothesis_count: 1,
              generated_at: null,
              raw_response_sha256: null,
              site_domain: "example.com",
              canonical_url: "https://example.com/",
              package_path: "/tmp/missing-pkg"
            }
          ]
        };
      }
      assert.match(sql, /llm_items/i);
      return {
        rows: [
          {
            id: 1,
            kind: "screen_pattern",
            name: "hero_media",
            signature: null,
            category: null,
            interpretation: "Media above heading",
            section_label: null,
            step_index: null,
            confidence: 0.9,
            evidence_refs: [],
            gaps: null
          },
          {
            id: 2,
            kind: "ui_element",
            name: "primary_cta",
            signature: null,
            category: null,
            interpretation: null,
            section_label: null,
            step_index: null,
            confidence: 0.8,
            evidence_refs: [],
            gaps: null
          },
          {
            id: 3,
            kind: "page_flow",
            name: null,
            signature: "media>heading",
            category: null,
            interpretation: null,
            section_label: "Hero",
            step_index: 1,
            confidence: null,
            evidence_refs: [],
            gaps: null
          },
          {
            id: 4,
            kind: "section_look",
            name: "sec_hero",
            signature: "media>heading>cta",
            category: "hero",
            interpretation: "Minimalist hero with scrim",
            section_label: null,
            step_index: null,
            confidence: 0.9,
            evidence_refs: [],
            gaps: null
          }
        ]
      };
    }
  };
  const handled = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    mock.response,
    new URL("http://127.0.0.1/api/library/analyses/cap_llm"),
    client
  );
  assert.equal(handled, true);
  assert.equal(mock.statusCode, 200);
  const body = JSON.parse(mock.body) as {
    items: {
      screen_patterns: unknown[];
      ui_elements: unknown[];
      page_flow: unknown[];
      section_look: unknown[];
    };
  };
  assert.equal(body.items.screen_patterns.length, 1);
  assert.equal(body.items.ui_elements.length, 1);
  assert.equal(body.items.page_flow.length, 1);
  assert.equal(body.items.section_look.length, 1);
});

test("library API attaches compact facets and filters GET /screens", async () => {
  const { mkdtemp, writeFile, mkdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  async function writeVisionPage(
    root: string,
    page: { atmosphere: string; layout: string; tags: string[]; pageType: string }
  ) {
    await mkdir(join(root, "derived"), { recursive: true });
    await writeFile(
      join(root, "derived/vision-page.json"),
      JSON.stringify({
        schema_version: "0.1.0",
        vision_page_version: "0.1.0",
        generated_at: new Date().toISOString(),
        source_screenshot: "viewports/desktop/screenshots/full-page.webp",
        page_type: page.pageType,
        overall_atmosphere: page.atmosphere,
        color_mood: "dark",
        typography_feel: "sans",
        above_the_fold: "hero",
        vertical_rhythm: page.layout,
        layout_system: page.layout,
        media_strategy: "photo",
        notable_modules: [],
        brand_cues: "",
        interaction_chrome: "",
        category_tags: page.tags,
        status: "complete"
      }),
      "utf8"
    );
  }

  const energyRoot = await mkdtemp(join(tmpdir(), "dig-facet-energy-"));
  const gridRoot = await mkdtemp(join(tmpdir(), "dig-facet-grid-"));
  await writeVisionPage(energyRoot, {
    atmosphere: "high-energy_corporate",
    layout: "full-bleed stacks",
    tags: ["media"],
    pageType: "marketing_agency_landing_page"
  });
  await writeVisionPage(gridRoot, {
    atmosphere: "minimal",
    layout: "card grid",
    tags: ["finance"],
    pageType: "finance_home"
  });

  const rows = [
    {
      id: 1,
      capture_run_id: "cap_energy",
      viewport_capture_id: "vpc_energy",
      name: "desktop",
      status: "complete",
      width: 1440,
      height: 900,
      title: "Energy",
      settled_screenshot_path: "viewports/desktop/screenshots/settled.webp",
      full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp",
      canonical_url: "https://energy.example/",
      site_domain: "energy.example",
      package_path: energyRoot
    },
    {
      id: 2,
      capture_run_id: "cap_grid",
      viewport_capture_id: "vpc_grid",
      name: "desktop",
      status: "complete",
      width: 1440,
      height: 900,
      title: "Grid",
      settled_screenshot_path: "viewports/desktop/screenshots/settled.webp",
      full_page_screenshot_path: "viewports/desktop/screenshots/full-page.webp",
      canonical_url: "https://grid.example/",
      site_domain: "grid.example",
      package_path: gridRoot
    }
  ];
  const client = {
    async query() {
      return { rows };
    }
  };

  const listed = mockResponse();
  const listedOk = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    listed.response,
    new URL("http://127.0.0.1/api/library/screens"),
    client
  );
  assert.equal(listedOk, true);
  assert.equal(listed.statusCode, 200);
  const listedBody = JSON.parse(listed.body) as {
    screens: Array<{ viewport_capture_id: string; design_facets: { style: string; layout: string } }>;
    facet_filters: { style: string[] };
  };
  assert.equal(listedBody.screens.length, 2);
  assert.equal(
    listedBody.screens.find((row) => row.viewport_capture_id === "vpc_energy")?.design_facets.style,
    "high-energy"
  );
  assert.ok(listedBody.facet_filters.style.includes("high-energy"));

  const filtered = mockResponse();
  const filteredOk = await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    filtered.response,
    new URL("http://127.0.0.1/api/library/screens?style=high-energy&layout=full-bleed%20stacks"),
    client
  );
  assert.equal(filteredOk, true);
  const filteredBody = JSON.parse(filtered.body) as { screens: Array<{ viewport_capture_id: string }> };
  assert.deepEqual(
    filteredBody.screens.map((row) => row.viewport_capture_id),
    ["vpc_energy"]
  );

  const industry = mockResponse();
  await handleLibraryApi(
    { method: "GET" } as IncomingMessage,
    industry.response,
    new URL("http://127.0.0.1/api/library/screens?industry=finance"),
    client
  );
  const industryBody = JSON.parse(industry.body) as { screens: Array<{ viewport_capture_id: string }> };
  assert.deepEqual(
    industryBody.screens.map((row) => row.viewport_capture_id),
    ["vpc_grid"]
  );
});
