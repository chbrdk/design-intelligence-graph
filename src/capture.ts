import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { dismissCookieBanner } from "./cookie-banner-dismiss.js";
import { resolve } from "node:path";
import { captureBrowserSnapshot } from "./browser-snapshot.js";
import { VERSION } from "./config.js";
import { createId, ensureDirectory, safeDirectoryName, writeArtifact, writeJsonLinesArtifact } from "./io.js";
import { CAPTURE_LIMITS, boundUtf8Text, matchedStyleNodeCap, matchedStylesMode } from "./capture-limits.js";
import { normalizeMatchedStyleEntry } from "./matched-styles-compact.js";
import { matchLogicalElements, type MatchableNode, type ViewportNodeSet } from "./matching.js";
import { deriveResponsiveTransformations, type MeasuredBox, type MeasuredStyle, type ResponsiveViewportEvidence } from "./responsive.js";
import { attachNetworkRecorder } from "./network.js";
import { captureSafeStates } from "./states.js";
import { captureScrollEvidence } from "./scroll.js";
import { summarizeMotion, type MotionEvidenceRecord } from "./motion.js";
import { captureFrameEvidence } from "./frames.js";
import { sanitizeDiagnostic, sanitizeEvidenceUrls, sanitizeHtml, sanitizeNodeRecords, sanitizeStoredUrl } from "./privacy.js";
import { aggregateQuality, evaluateQuality, ZERO_QUALITY_METRICS, type QualityMetrics } from "./quality.js";
import { analyzeViewportLayout } from "./layout-analysis.js";
import { collectPerformanceEvidence, installPerformanceObservers } from "./performance.js";
import { createPageIdentity, createSiteIdentity } from "./identity.js";
import { analyzeColorUsage } from "./color-analysis.js";
import { deriveResponsiveLayoutGraph, deriveViewportGeometryLayout, GEOMETRY_MODEL_VERSION } from "./geometry-model.js";
import { attachLogicalElements, deriveViewportOntology, enrichOntologyWithSectionCompositions } from "./ontology.js";
import { ONTOLOGY_VERSION, TAXONOMY } from "./taxonomy.js";
import {
  deriveSectionCompositionsDocument
} from "./section-composition.js";
import { emitSectionCrops } from "./section-crops.js";
import { deriveVisualHypotheses, deriveVisualLanguageViewport, VISUAL_LANGUAGE_VERSION, type VisualViewportEvidence } from "./visual-language.js";
import { deriveAnalysisReport } from "./analysis-pipeline.js";
import { pauseAnimations, scrollSettlePage, stabilizePage } from "./stabilize.js";
import { screenshotOptions, screenshotSettings } from "./screenshot-settings.js";
import type { CaptureManifest, CaptureOptions, ViewportDefinition, ViewportResult } from "./types.js";

interface RuntimeEvidence {
  console: Array<{ type: string; text: string }>;
  pageErrors: string[];
  failedRequests: Array<{ url: string; method: string; resource_type: string; error: string | null }>;
}

function attachRuntimeEvidence(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = { console: [], pageErrors: [], failedRequests: [] };
  page.on("console", (message) => evidence.console.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => evidence.failedRequests.push({
    url: request.url(), method: request.method(), resource_type: request.resourceType(), error: request.failure()?.errorText ?? null
  }));
  return evidence;
}

async function semanticBrowserSnapshot(
  context: BrowserContext,
  page: Page,
  preferredNodeIds: string[] = []
): Promise<{ accessibility: unknown[]; matchedStyles: unknown[] }> {
  const session = await context.newCDPSession(page);
  try {
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const result = await session.send("Accessibility.getFullAXTree");
    const documentNode = await session.send("DOM.getDocument", { depth: 0 });
    const matches = await session.send("DOM.querySelectorAll", {
      nodeId: documentNode.root.nodeId,
      selector: "[data-dig-capture-node-id]"
    });
    const captureIdByBackendNode = new Map<number, string>();
    const matchedStyles: unknown[] = [];
    const styleMode = matchedStylesMode();
    const nodeCap = matchedStyleNodeCap();
    const preferred = new Set(preferredNodeIds.slice(0, nodeCap));
    for (const nodeId of matches.nodeIds) {
      if (styleMode !== "off" && matchedStyles.length >= nodeCap) break;
      const [attributes, described] = await Promise.all([
        session.send("DOM.getAttributes", { nodeId }),
        session.send("DOM.describeNode", { nodeId })
      ]);
      for (let index = 0; index < attributes.attributes.length; index += 2) {
        if (attributes.attributes[index] === "data-dig-capture-node-id") {
          const captureNodeId = attributes.attributes[index + 1];
          if (captureNodeId) captureIdByBackendNode.set(described.node.backendNodeId, captureNodeId);
          if (!captureNodeId) continue;
          if (styleMode === "off") continue;
          if (preferred.size > 0 && !preferred.has(captureNodeId)) continue;
          try {
            const matched = await session.send("CSS.getMatchedStylesForNode", { nodeId });
            const normalized = normalizeMatchedStyleEntry({
              node_id: captureNodeId,
              matched_rules: matched.matchedCSSRules ?? [],
              inherited: matched.inherited ?? [],
              pseudo_elements: matched.pseudoElements ?? [],
              inherited_pseudo_elements: matched.inheritedPseudoElements ?? [],
              provenance: { layer: "L1", method: "cdp_get_matched_styles", confidence: 1 }
            });
            if (normalized) matchedStyles.push(normalized);
          } catch { /* CSS domain may not expose internal or special nodes */ }
        }
      }
    }
    return {
      accessibility: result.nodes.map((node) => ({
        ...node,
        ...(node.backendDOMNodeId && captureIdByBackendNode.has(node.backendDOMNodeId)
          ? { dom_node_id: captureIdByBackendNode.get(node.backendDOMNodeId) }
          : {})
      })),
      matchedStyles
    };
  } finally {
    await session.detach();
  }
}

async function captureViewport(
  browser: Browser,
  options: CaptureOptions,
  viewport: ViewportDefinition,
  packageRoot: string
): Promise<{
  result: ViewportResult;
  canonicalUrl: string;
  userAgent: string;
  nodes: MatchableNode[];
  boxes: MeasuredBox[];
  styles: MeasuredStyle[];
  assets: Array<{ type?: string; node_id?: string; intrinsic?: { width?: number; height?: number } }>;
  fonts: Array<{ family?: string; status?: string }>;
  motion: MotionEvidenceRecord[];
}> {
  const startedAt = new Date().toISOString();
  const viewportId = createId("vpc");
  const prefix = `viewports/${viewport.name}`;
  const warnings: string[] = [];
  const artifacts: ViewportResult["artifacts"] = {};
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: options.locale,
    timezoneId: options.timezoneId,
    colorScheme: options.colorScheme,
    reducedMotion: options.reducedMotion,
    hasTouch: false,
    isMobile: false
  });
  const page = await context.newPage();
  await installPerformanceObservers(page);
  const runtime = attachRuntimeEvidence(page);
  const network = attachNetworkRecorder(page);
  try {
    const response = await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    if (!response) warnings.push("navigation_response_unavailable");
    if (response && !response.ok()) warnings.push(`navigation_http_${response.status()}`);
    const settled = await stabilizePage(page, options.settleMs, options.timeoutMs);
    if (!settled) warnings.push("stabilization_timeout");
    try {
      const scrollSettle = await scrollSettlePage(page);
      if (scrollSettle.scrolled_px > 0) {
        warnings.push(`scroll_settle_px:${scrollSettle.scrolled_px}`);
      }
      // Brief quiet window after lazy loads.
      const postScrollQuiet = await stabilizePage(page, Math.min(options.settleMs, 400), Math.min(options.timeoutMs, 5000));
      if (!postScrollQuiet) warnings.push("post_scroll_settle_timeout");
    } catch (error) {
      warnings.push(`scroll_settle_failed:${error instanceof Error ? error.message : String(error)}`);
    }

    const cookieDismiss = await dismissCookieBanner(page);
    if (cookieDismiss.error) warnings.push(`cookie_dismiss_failed:${cookieDismiss.error}`);
    else warnings.push("cookie_banner_dismissed");

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const sourceHtmlBound = boundUtf8Text(
      sanitizeHtml(response ? await response.body().then((body) => body.toString("utf8")).catch(() => "") : "", page.url()),
      CAPTURE_LIMITS.maxHtmlBytes,
      "source_html"
    );
    const renderedHtmlBound = boundUtf8Text(
      sanitizeHtml(await page.content(), page.url()),
      CAPTURE_LIMITS.maxHtmlBytes,
      "rendered_html"
    );
    if (sourceHtmlBound.truncated) warnings.push("source_html_truncated");
    if (renderedHtmlBound.truncated) warnings.push("rendered_html_truncated");
    const sourceHtml = sourceHtmlBound.value;
    const renderedHtml = renderedHtmlBound.value;
    const settledScreenshot = await page.screenshot(screenshotOptions(false));
    const fullPageScreenshot = await page.screenshot(screenshotOptions(true));
    const snapshot = await captureBrowserSnapshot(page);
    const performanceEvidence = await collectPerformanceEvidence(page);
    const sanitizedNodes = sanitizeNodeRecords(snapshot.nodes as MatchableNode[], page.url());
    const frameCapture = await captureFrameEvidence(page, packageRoot, prefix);
    warnings.push(...frameCapture.warnings);
    Object.assign(artifacts, frameCapture.artifacts);
    artifacts.frames = await writeArtifact(
      packageRoot,
      `${prefix}/frames/index.json`,
      JSON.stringify({ schema_version: "0.1.0", frame_count: frameCapture.frames.length, frames: frameCapture.frames }, null, 2),
      "application/json"
    );
    let accessibility: unknown[] = [];
    let matchedStyles: unknown[] = [];
    try {
      const preferredMatchedNodes = sanitizedNodes
        .filter((node) => Boolean((node as { rendered?: boolean }).rendered))
        .map((node) => node.node_id);
      const semanticSnapshot = await semanticBrowserSnapshot(context, page, preferredMatchedNodes);
      accessibility = semanticSnapshot.accessibility;
      matchedStyles = semanticSnapshot.matchedStyles;
      const nodeCap = matchedStyleNodeCap();
      if (matchedStylesMode() === "off") {
        warnings.push("matched_styles_omitted");
      } else if (preferredMatchedNodes.length > nodeCap) {
        warnings.push(`matched_styles_capped:${nodeCap}`);
      }
    } catch (error) {
      warnings.push(`accessibility_capture_failed:${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.evaluate(() => document.querySelectorAll("[data-dig-capture-node-id]").forEach((element) =>
        element.removeAttribute("data-dig-capture-node-id")));
    }
    const stateCapture = await captureSafeStates(page, sanitizedNodes, packageRoot, prefix);
    warnings.push(...stateCapture.warnings);
    Object.assign(artifacts, stateCapture.artifacts);
    artifacts.states = await writeArtifact(
      packageRoot,
      `${prefix}/states/index.json`,
      JSON.stringify({
        schema_version: "0.1.0",
        policy: "safe_non_activating_states",
        state_count: stateCapture.records.length,
        states: stateCapture.records
      }, null, 2),
      "application/json"
    );
    const scrollCapture = await captureScrollEvidence(
      page,
      sanitizedNodes,
      snapshot.styles as MeasuredStyle[],
      packageRoot,
      prefix
    );
    warnings.push(...scrollCapture.warnings);
    Object.assign(artifacts, scrollCapture.artifacts);
    artifacts.scroll = await writeArtifact(
      packageRoot,
      `${prefix}/scroll/index.json`,
      JSON.stringify({
        schema_version: "0.1.0",
        strategy: "top_first_viewport_midpoint_bottom",
        sample_count: scrollCapture.samples.length,
        restoration: { attempted: true, successful: scrollCapture.restored },
        samples: scrollCapture.samples
      }, null, 2),
      "application/json"
    );
    await pauseAnimations(page);
    await dismissCookieBanner(page);
    const stabilizedScreenshot = await page.screenshot(screenshotOptions(false));

    artifacts.source_html = await writeArtifact(packageRoot, `${prefix}/html/source.html`, sourceHtml, "text/html; charset=utf-8");
    artifacts.rendered_html = await writeArtifact(packageRoot, `${prefix}/html/rendered.html`, renderedHtml, "text/html; charset=utf-8");
    artifacts.nodes = await writeJsonLinesArtifact(packageRoot, `${prefix}/dom/nodes.jsonl`, sanitizedNodes);
    artifacts.accessibility = await writeJsonLinesArtifact(
      packageRoot,
      `${prefix}/dom/accessibility.jsonl`,
      sanitizeEvidenceUrls(accessibility, page.url()) as unknown[]
    );
    artifacts.computed_styles = await writeJsonLinesArtifact(packageRoot, `${prefix}/styles/computed.jsonl`, snapshot.styles as unknown[]);
    if (matchedStylesMode() !== "off" && matchedStyles.length > 0) {
      artifacts.matched_styles = await writeJsonLinesArtifact(
        packageRoot,
        `${prefix}/styles/matched.jsonl`,
        sanitizeEvidenceUrls(matchedStyles, page.url()) as unknown[]
      );
    }
    artifacts.stylesheets = await writeArtifact(packageRoot, `${prefix}/styles/stylesheets.json`, JSON.stringify(sanitizeEvidenceUrls(snapshot.stylesheets, page.url()), null, 2), "application/json");
    artifacts.custom_properties = await writeJsonLinesArtifact(
      packageRoot,
      `${prefix}/styles/variables.jsonl`,
      snapshot.customProperties as unknown[]
    );
    artifacts.colors = await writeArtifact(
      packageRoot,
      `${prefix}/styles/colors.json`,
      JSON.stringify({
        schema_version: "0.1.0", color_space: "srgb", layer: "L2",
        colors: analyzeColorUsage(snapshot.styles as MeasuredStyle[]),
        provenance: { layer: "L2", method: "computed_color_normalization", confidence: 1 }
      }, null, 2),
      "application/json"
    );
    artifacts.motion = await writeArtifact(packageRoot, `${prefix}/motion/motions.json`, JSON.stringify(snapshot.motion, null, 2), "application/json");
    artifacts.motion_summary = await writeArtifact(
      packageRoot,
      `${prefix}/motion/summary.json`,
      JSON.stringify({
        schema_version: "0.1.0",
        layer: "L2",
        ...summarizeMotion(snapshot.motion as MotionEvidenceRecord[]),
        provenance: { layer: "L2", method: "deterministic_motion_summary", confidence: 1 }
      }, null, 2),
      "application/json"
    );
    artifacts.performance = await writeArtifact(packageRoot, `${prefix}/runtime/performance.json`, JSON.stringify(performanceEvidence, null, 2), "application/json");
    artifacts.geometry = await writeJsonLinesArtifact(packageRoot, `${prefix}/geometry/boxes.jsonl`, snapshot.boxes as unknown[]);
    artifacts.text_lines = await writeJsonLinesArtifact(packageRoot, `${prefix}/geometry/text-lines.jsonl`, snapshot.textLines as unknown[]);
    artifacts.assets = await writeArtifact(packageRoot, `${prefix}/assets/metadata.json`, JSON.stringify(sanitizeEvidenceUrls(snapshot.assets, page.url()), null, 2), "application/json");
    artifacts.fonts = await writeArtifact(packageRoot, `${prefix}/styles/fonts.json`, JSON.stringify(snapshot.fonts, null, 2), "application/json");
    artifacts.font_faces = await writeArtifact(packageRoot, `${prefix}/styles/font-faces.json`, JSON.stringify(sanitizeEvidenceUrls(snapshot.fontFaces, page.url()), null, 2), "application/json");
    const sanitizedRuntime = {
      console: runtime.console.map((item) => ({ ...item, text: sanitizeDiagnostic(item.text) })),
      pageErrors: runtime.pageErrors.map(sanitizeDiagnostic),
      failedRequests: runtime.failedRequests.map((item) => ({ ...item, url: sanitizeStoredUrl(item.url), error: item.error ? sanitizeDiagnostic(item.error) : null }))
    };
    artifacts.runtime = await writeArtifact(packageRoot, `${prefix}/runtime/evidence.json`, JSON.stringify(sanitizedRuntime, null, 2), "application/json");
    await network.flush();
    artifacts.network = await writeJsonLinesArtifact(packageRoot, `${prefix}/network/requests.jsonl`, network.records as unknown[]);
    const shot = screenshotSettings();
    artifacts.viewport_screenshot = await writeArtifact(packageRoot, `${prefix}/screenshots/settled${shot.extension}`, settledScreenshot, shot.mediaType);
    artifacts.full_page_screenshot = await writeArtifact(packageRoot, `${prefix}/screenshots/full-page${shot.extension}`, fullPageScreenshot, shot.mediaType);
    artifacts.stabilized_screenshot = await writeArtifact(packageRoot, `${prefix}/screenshots/stabilized${shot.extension}`, stabilizedScreenshot, shot.mediaType);

    const visibleNodes = snapshot.nodes.filter((item) => (item as { rendered?: boolean }).rendered).length;
    const measurableNodeIds = new Set(sanitizedNodes.filter((node) => node.node_type === "element" || node.node_type === "pseudo").map((node) => node.node_id));
    const geometryNodeIds = new Set((snapshot.boxes as MeasuredBox[]).map((box) => box.node_id));
    const styleNodeIds = new Set((snapshot.styles as MeasuredStyle[]).map((style) => style.node_id));
    const accessibilityLinkedNodes = new Set(accessibility.flatMap((item) => {
      const domNodeId = (item as { dom_node_id?: string }).dom_node_id;
      return domNodeId === undefined ? [] : [domNodeId];
    })).size;
    const assetRecords = snapshot.assets as Array<{ type?: string; complete?: boolean }>;
    const completeAssets = assetRecords.filter((asset) => asset.type !== "image" || asset.complete).length;
    const fontRecords = snapshot.fonts as Array<{ status?: string }>;
    const completeFonts = fontRecords.filter((font) => font.status === "loaded").length;
    const completedRequests = network.records.filter((record) => record.outcome !== "pending").length;
    const qualityMetrics: QualityMetrics = {
      subsystem_success: warnings.length ? 0.8 : 1,
      geometry_coverage: measurableNodeIds.size ? [...measurableNodeIds].filter((id) => geometryNodeIds.has(id)).length / measurableNodeIds.size : 1,
      style_coverage: measurableNodeIds.size ? [...measurableNodeIds].filter((id) => styleNodeIds.has(id)).length / measurableNodeIds.size : 1,
      screenshot_completeness: 1,
      accessibility_coverage: measurableNodeIds.size ? Math.min(1, accessibilityLinkedNodes / measurableNodeIds.size) : accessibility.length ? 1 : 0,
      asset_completeness: assetRecords.length ? completeAssets / assetRecords.length : 1,
      font_completeness: fontRecords.length ? completeFonts / fontRecords.length : 1,
      network_completion: network.records.length ? completedRequests / network.records.length : 1,
      state_restoration: stateCapture.records.every((record) => record.restoration.successful) ? 1 : 0,
      scroll_restoration: scrollCapture.restored ? 1 : 0
    };
    const viewportQuality = evaluateQuality(qualityMetrics);
    return {
      canonicalUrl: sanitizeStoredUrl(snapshot.canonicalUrl ?? page.url(), page.url()),
      userAgent,
      nodes: sanitizedNodes,
      boxes: snapshot.boxes as MeasuredBox[],
      styles: snapshot.styles as MeasuredStyle[],
      assets: snapshot.assets as Array<{ type?: string; node_id?: string; intrinsic?: { width?: number; height?: number } }>,
      fonts: snapshot.fonts as Array<{ family?: string; status?: string }>,
      motion: snapshot.motion as MotionEvidenceRecord[],
      result: {
        viewport_capture_id: viewportId,
        name: viewport.name,
        viewport: { width: viewport.width, height: viewport.height, device_scale_factor: viewport.deviceScaleFactor },
        document: snapshot.document,
        final_url: sanitizeStoredUrl(page.url()),
        title: await page.title(),
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status: warnings.length ? "partial" : "complete",
        node_count: snapshot.nodes.length,
        visible_node_count: visibleNodes,
        text_line_count: snapshot.textLines.length,
        artifacts,
        warnings,
        quality: viewportQuality
      }
    };
  } finally {
    await context.close();
  }
}

export async function capture(options: CaptureOptions): Promise<{ packageRoot: string; manifest: CaptureManifest }> {
  const startedAt = new Date().toISOString();
  const requestedUrl = new URL(options.url);
  if (!/^https?:$/.test(requestedUrl.protocol)) throw new Error("Only http:// and https:// URLs are supported.");
  const runId = createId("cap");
  const timestamp = startedAt.replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const packageRoot = resolve(options.outputDirectory, `${safeDirectoryName(requestedUrl)}_${timestamp}_${runId.slice(-8)}`);
  await ensureDirectory(packageRoot);

  const browser = await chromium.launch({ headless: !options.headed });
  const results: ViewportResult[] = [];
  const viewportNodeSets: ViewportNodeSet[] = [];
  const responsiveEvidence: ResponsiveViewportEvidence[] = [];
  const visualEvidence: VisualViewportEvidence[] = [];
  const errors: CaptureManifest["errors"] = [];
  let canonicalUrl = options.url;
  let userAgent = "unknown";
  try {
    for (const viewport of options.viewports) {
      try {
        const captured = await captureViewport(browser, options, viewport, packageRoot);
        results.push(captured.result);
        canonicalUrl = captured.canonicalUrl;
        userAgent = captured.userAgent;
        viewportNodeSets.push({
          viewport_capture_id: captured.result.viewport_capture_id,
          viewport_name: captured.result.name,
          nodes: captured.nodes
        });
        responsiveEvidence.push({
          viewport_capture_id: captured.result.viewport_capture_id,
          viewport_name: captured.result.name,
          width: captured.result.viewport.width,
          height: captured.result.viewport.height,
          documentWidth: captured.result.document.width,
          documentHeight: captured.result.document.height,
          nodes: captured.nodes,
          boxes: captured.boxes,
          styles: captured.styles
        });
        visualEvidence.push({
          viewport_capture_id: captured.result.viewport_capture_id, viewport_name: captured.result.name,
          document_width: captured.result.document.width, document_height: captured.result.document.height,
          visible_node_count: captured.result.visible_node_count, styles: captured.styles, boxes: captured.boxes,
          assets: captured.assets, fonts: captured.fonts, motion: captured.motion
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ viewport: viewport.name, code: "viewport_capture_failed", message: sanitizeDiagnostic(message) });
        results.push({
          viewport_capture_id: createId("vpc"), name: viewport.name,
          viewport: { width: viewport.width, height: viewport.height, device_scale_factor: viewport.deviceScaleFactor },
          document: { width: 0, height: 0 }, final_url: sanitizeStoredUrl(options.url), title: "", started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(), status: "failed", node_count: 0, visible_node_count: 0,
          text_line_count: 0, artifacts: {}, warnings: [sanitizeDiagnostic(message)], quality: evaluateQuality(ZERO_QUALITY_METRICS)
        });
      }
    }
  } finally {
    await browser.close();
  }

  const completeCount = results.filter((result) => result.status === "complete").length;
  const successfulCount = results.filter((result) => result.status === "complete" || result.status === "partial").length;
  const status = completeCount === results.length ? "complete" : successfulCount > 0 ? "partial" : "failed";
  const logicalElements = matchLogicalElements(viewportNodeSets);
  const runArtifacts: CaptureManifest["run_artifacts"] = {};
  runArtifacts.logical_elements = await writeArtifact(
    packageRoot,
    "derived/logical-elements.json",
    JSON.stringify({
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      layer: "L2",
      logical_element_count: logicalElements.length,
      logical_elements: logicalElements
    }, null, 2),
    "application/json"
  );
  const responsiveTransformations = deriveResponsiveTransformations(logicalElements, responsiveEvidence);
  runArtifacts.responsive_transformations = await writeArtifact(
    packageRoot,
    "derived/responsive-transformations.json",
    JSON.stringify({
      schema_version: "0.1.0",
      generated_at: new Date().toISOString(),
      layer: "L2",
      comparison_strategy: "adjacent_viewports_by_width",
      transformation_count: responsiveTransformations.length,
      transformations: responsiveTransformations
    }, null, 2),
    "application/json"
  );
  const layoutAnalyses = responsiveEvidence.map((evidence) => analyzeViewportLayout({
    viewport_capture_id: evidence.viewport_capture_id,
    viewport_name: evidence.viewport_name,
    nodes: evidence.nodes,
    boxes: evidence.boxes
  }));
  runArtifacts.layout_analysis = await writeArtifact(
    packageRoot,
    "derived/layout-analysis.json",
    JSON.stringify({ schema_version: "0.1.0", layer: "L2", viewports: layoutAnalyses }, null, 2),
    "application/json"
  );
  const geometryLayouts = responsiveEvidence.map(deriveViewportGeometryLayout);
  runArtifacts.geometry_layout = await writeArtifact(
    packageRoot,
    "derived/geometry-layout.json",
    JSON.stringify({
      schema_version: "0.1.0",
      geometry_model_version: GEOMETRY_MODEL_VERSION,
      generated_at: new Date().toISOString(),
      layer: "L2",
      viewports: geometryLayouts
    }, null, 2),
    "application/json"
  );
  runArtifacts.responsive_layout_graph = await writeArtifact(
    packageRoot,
    "derived/responsive-layout-graph.json",
    JSON.stringify(deriveResponsiveLayoutGraph(logicalElements, responsiveTransformations), null, 2),
    "application/json"
  );
  const visualLanguageViewports = visualEvidence.map(deriveVisualLanguageViewport);
  const visualHypotheses = deriveVisualHypotheses(visualLanguageViewports);
  runArtifacts.visual_language = await writeArtifact(
    packageRoot,
    "derived/visual-language.json",
    JSON.stringify({
      schema_version: "0.1.0", visual_language_version: VISUAL_LANGUAGE_VERSION, generated_at: new Date().toISOString(),
      viewports: visualLanguageViewports, hypotheses: visualHypotheses
    }, null, 2),
    "application/json"
  );
  const viewportOntologies = attachLogicalElements(responsiveEvidence.map((evidence) => {
    const result = results.find((candidate) => candidate.viewport_capture_id === evidence.viewport_capture_id)!;
    return deriveViewportOntology({
      viewport_capture_id: evidence.viewport_capture_id,
      viewport_name: evidence.viewport_name,
      viewport_height: evidence.height,
      title: result.title,
      nodes: evidence.nodes,
      boxes: evidence.boxes,
      styles: evidence.styles
    });
  }), logicalElements);
  const sectionCompositionDoc = deriveSectionCompositionsDocument(
    responsiveEvidence.map((evidence) => ({
      viewport_capture_id: evidence.viewport_capture_id,
      viewport_name: evidence.viewport_name,
      viewport_height: evidence.height,
      nodes: evidence.nodes,
      boxes: evidence.boxes,
      styles: evidence.styles
    }))
  );
  const enrichedOntologies = enrichOntologyWithSectionCompositions(
    viewportOntologies,
    sectionCompositionDoc.viewports.flatMap((viewport) => viewport.sections)
  );
  runArtifacts.section_compositions = await writeArtifact(
    packageRoot,
    "derived/section-compositions.json",
    JSON.stringify(sectionCompositionDoc, null, 2),
    "application/json"
  );
  try {
    const cropEmit = await emitSectionCrops({
      packageRoot,
      viewportCaptures: results,
      sections: sectionCompositionDoc.viewports.flatMap((viewport) => viewport.sections),
      viewportName: "desktop"
    });
    runArtifacts.section_crops = cropEmit.artifact;
  } catch (error: unknown) {
    errors.push({
      code: "section_crops_failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
  runArtifacts.ontology_catalog = await writeArtifact(
    packageRoot,
    "ontology/catalog.json",
    JSON.stringify({ ontology_version: ONTOLOGY_VERSION, terms: TAXONOMY }, null, 2),
    "application/json"
  );
  runArtifacts.ontology = await writeArtifact(
    packageRoot,
    "derived/ontology.json",
    JSON.stringify({
      schema_version: "0.1.0",
      ontology_version: ONTOLOGY_VERSION,
      generated_at: new Date().toISOString(),
      viewports: enrichedOntologies
    }, null, 2),
    "application/json"
  );
  const viewportEvaluations = results.map((result) => result.quality);
  const aggregateEvaluation = aggregateQuality(viewportEvaluations);
  const quality = {
    ...aggregateEvaluation,
    viewport_completeness: `${successfulCount}/${results.length}`,
    viewports: results.map((result, index) => ({
      viewport_capture_id: result.viewport_capture_id,
      name: result.name,
      ...(viewportEvaluations[index] ?? evaluateQuality(ZERO_QUALITY_METRICS))
    })),
    warnings: results.flatMap((item) => item.warnings),
    errors
  };
  runArtifacts.quality = await writeArtifact(packageRoot, "quality.json", JSON.stringify(quality, null, 2), "application/json");
  runArtifacts.analysis = await writeArtifact(
    packageRoot,
    "derived/analysis-report.json",
    JSON.stringify(deriveAnalysisReport({
      logical_elements: logicalElements, transformations: responsiveTransformations, geometry_layouts: geometryLayouts,
      ontologies: enrichedOntologies, visual_language: visualLanguageViewports, visual_hypotheses: visualHypotheses,
      quality: aggregateEvaluation
    }), null, 2),
    "application/json"
  );
  const sanitizedCanonicalUrl = sanitizeStoredUrl(canonicalUrl);
  const site = createSiteIdentity(sanitizedCanonicalUrl);
  const pageIdentity = createPageIdentity(sanitizedCanonicalUrl, site.site_id);
  const manifest: CaptureManifest = {
    schema_version: "0.1.0", capture_run_id: runId, started_at: startedAt, completed_at: new Date().toISOString(),
    requested_url: sanitizeStoredUrl(options.url), canonical_url: sanitizedCanonicalUrl,
    site,
    page: pageIdentity,
    crawler: { name: "dig-capture", version: VERSION },
    browser: { engine: "chromium", version: browser.version(), user_agent: userAgent, locale: options.locale, timezone: options.timezoneId },
    environment: { prefers_color_scheme: options.colorScheme, prefers_reduced_motion: options.reducedMotion === "reduce",
      forced_colors: false, touch: false, pointer: "fine", hover: true },
    capture_dimensions: {
      locale: options.locale, market: "unknown", theme: options.colorScheme, consent_state: "dismissed_heuristic",
      authentication_state: "unauthenticated", personalization: "unknown", experiments: []
    },
    policy: {
      authorization_basis: "user_initiated_public_capture",
      robots_decision: "not_evaluated_interactive_capture",
      retention_class: "unspecified",
      redistribution_class: "structural_evidence_only"
    },
    status,
    capture_status: { dom: status, css: status, visual: status, assets: status, accessibility: status, interaction: status },
    run_artifacts: runArtifacts,
    viewport_captures: results,
    interventions: [
      "sanitized_stored_urls_and_sensitive_form_values",
      "paused_css_animations_for_stabilized_screenshot",
      "disabled_css_transitions_for_stabilized_screenshot",
      "cookie_banner_dismiss_heuristic"
    ],
    errors
  };
  await writeArtifact(packageRoot, "manifest.json", JSON.stringify(manifest, null, 2), "application/json");
  return { packageRoot, manifest };
}
