import type { Page } from "playwright";
import { STYLE_PROPERTIES } from "./config.js";

export interface BrowserSnapshot {
  document: { width: number; height: number };
  canonicalUrl: string | null;
  nodes: unknown[];
  styles: unknown[];
  boxes: unknown[];
  textLines: unknown[];
  assets: unknown[];
  fonts: unknown[];
  stylesheets: unknown[];
  customProperties: unknown[];
  motion: unknown[];
  fontFaces: unknown[];
}

export async function captureBrowserSnapshot(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate((styleProperties) => {
    const nodes: Record<string, unknown>[] = [];
    const styles: Record<string, unknown>[] = [];
    const boxes: Record<string, unknown>[] = [];
    const textLines: Record<string, unknown>[] = [];
    const assets: Record<string, unknown>[] = [];
    const nodeIds = new Map<Node, string>();
    let sequence = 0;

    const finite = (value: number): number => Number.isFinite(value) ? value : 0;
    const rectValue = (rect: DOMRect | DOMRectReadOnly) => ({
      x: finite(rect.x + window.scrollX),
      y: finite(rect.y + window.scrollY),
      viewport_x: finite(rect.x),
      viewport_y: finite(rect.y),
      width: finite(rect.width),
      height: finite(rect.height)
    });
    const idFor = (node: Node): string => {
      let id = nodeIds.get(node);
      if (!id) {
        id = `node_${String(++sequence).padStart(8, "0")}`;
        nodeIds.set(node, id);
      }
      return id;
    };
    const cssPath = (element: Element): string => {
      const parts: string[] = [];
      let current: Element | null = element;
      while (current && parts.length < 12) {
        let part = current.localName;
        if (current.id) {
          part += `#${CSS.escape(current.id)}`;
          parts.unshift(part);
          break;
        }
        const parent: Element | null = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((item) => item.localName === current?.localName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(" > ");
    };
    const sourceAnchor = (element: Element) => {
      const names = ["id", "data-testid", "data-test", "aria-label", "name", "role", "href"];
      return Object.fromEntries(names.flatMap((name) => {
        const value = element.getAttribute(name);
        return value === null ? [] : [[name, value]];
      }));
    };
    const visible = (element: Element, style: CSSStyleDeclaration, rect: DOMRect): boolean =>
      style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    const pixels = (value: string): number => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const box = (x: number, y: number, width: number, height: number) => ({
      x: finite(x), y: finite(y), width: finite(Math.max(0, width)), height: finite(Math.max(0, height))
    });

    const visit = (node: Node, parentId: string | null, siblingIndex: number, shadowHostId: string | null = null) => {
      const nodeId = idFor(node);
      if (node.nodeType === Node.TEXT_NODE) {
        const rawText = node.textContent ?? "";
        const normalizedText = rawText.replace(/\s+/g, " ").trim();
        if (!normalizedText) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
        const parentElement = node.parentElement;
        const parentStyle = parentElement ? getComputedStyle(parentElement) : null;
        nodes.push({
          node_id: nodeId,
          parent_node_id: parentId,
          node_type: "text",
          sibling_index: siblingIndex,
          text: normalizedText,
          raw_text: rawText,
          character_count: normalizedText.length,
          word_count: normalizedText.split(/\s+/).length,
          line_count: rects.length,
          declared_language: parentElement?.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang ?? null,
          direction: parentStyle?.direction ?? "ltr",
          writing_mode: parentStyle?.writingMode ?? "horizontal-tb",
          truncated: parentElement ? (parentElement.scrollWidth > parentElement.clientWidth || parentElement.scrollHeight > parentElement.clientHeight) &&
            (parentStyle?.overflowX !== "visible" || parentStyle?.overflowY !== "visible") : false,
          rendered: rects.length > 0,
          provenance: { layer: "L1", method: "dom_range", confidence: 1 }
        });
        rects.forEach((rect, lineIndex) => textLines.push({
          node_id: nodeId,
          line_index: lineIndex,
          ...rectValue(rect),
          provenance: { layer: "L1", method: "range_client_rect", confidence: 1 }
        }));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      const htmlElement = element as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const isVisible = visible(element, style, rect);
      const attributes = Object.fromEntries(Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value]));
      element.setAttribute("data-dig-capture-node-id", nodeId);
      nodes.push({
        node_id: nodeId,
        parent_node_id: parentId,
        node_type: "element",
        tag: element.localName,
        namespace: element.namespaceURI,
        sibling_index: siblingIndex,
        attributes,
        source_anchor: sourceAnchor(element),
        dom_path: cssPath(element),
        shadow_dom: shadowHostId !== null,
        shadow_host_node_id: shadowHostId,
        rendered: isVisible,
        in_viewport: isVisible && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
        provenance: { layer: "L0", method: "rendered_dom", confidence: 1 }
      });
      boxes.push({
        node_id: nodeId,
        bbox: rectValue(rect),
        bbox_normalized: [
          { reference: "viewport", x: finite(rect.x / innerWidth), y: finite(rect.y / innerHeight), width: finite(rect.width / innerWidth), height: finite(rect.height / innerHeight) },
          { reference: "document", x: finite((rect.x + scrollX) / Math.max(1, document.documentElement.scrollWidth)), y: finite((rect.y + scrollY) / Math.max(1, document.documentElement.scrollHeight)), width: finite(rect.width / Math.max(1, document.documentElement.scrollWidth)), height: finite(rect.height / Math.max(1, document.documentElement.scrollHeight)) }
        ],
        box_model: (() => {
          const border = {
            top: pixels(style.borderTopWidth), right: pixels(style.borderRightWidth),
            bottom: pixels(style.borderBottomWidth), left: pixels(style.borderLeftWidth)
          };
          const padding = {
            top: pixels(style.paddingTop), right: pixels(style.paddingRight),
            bottom: pixels(style.paddingBottom), left: pixels(style.paddingLeft)
          };
          const margin = {
            top: pixels(style.marginTop), right: pixels(style.marginRight),
            bottom: pixels(style.marginBottom), left: pixels(style.marginLeft)
          };
          const documentX = rect.x + scrollX;
          const documentY = rect.y + scrollY;
          return {
            content: box(documentX + border.left + padding.left, documentY + border.top + padding.top,
              rect.width - border.left - border.right - padding.left - padding.right,
              rect.height - border.top - border.bottom - padding.top - padding.bottom),
            padding: box(documentX + border.left, documentY + border.top,
              rect.width - border.left - border.right, rect.height - border.top - border.bottom),
            border: box(documentX, documentY, rect.width, rect.height),
            margin: box(documentX - margin.left, documentY - margin.top,
              rect.width + margin.left + margin.right, rect.height + margin.top + margin.bottom),
            sides: { margin, border, padding },
            box_sizing: style.boxSizing,
            geometry_basis: style.transform === "none" ? "untransformed_css_box" : "transformed_owner_bbox_approximation"
          };
        })(),
        layout_context: {
          display: style.display,
          position: style.position,
          flex: style.display.includes("flex") ? {
            direction: style.flexDirection, wrap: style.flexWrap, justify_content: style.justifyContent,
            align_items: style.alignItems, align_content: style.alignContent, gap: style.gap,
            order: style.order, grow: style.flexGrow, shrink: style.flexShrink, basis: style.flexBasis
          } : null,
          grid: style.display.includes("grid") ? {
            template_columns: style.gridTemplateColumns, template_rows: style.gridTemplateRows,
            auto_flow: style.gridAutoFlow, column: style.gridColumn, row: style.gridRow,
            column_gap: style.columnGap, row_gap: style.rowGap
          } : null,
          containing_block_node_id: htmlElement.offsetParent ? idFor(htmlElement.offsetParent) : null,
          transform: style.transform,
          transform_origin: style.transformOrigin
        },
        scroll_width: htmlElement.scrollWidth ?? 0,
        scroll_height: htmlElement.scrollHeight ?? 0,
        client_rects: Array.from(element.getClientRects()).map(rectValue),
        provenance: { layer: "L1", method: "get_bounding_client_rect", confidence: 1 }
      });
      styles.push({
        node_id: nodeId,
        properties: Object.fromEntries(styleProperties.map((property) => [property, style.getPropertyValue(property)])),
        provenance: { layer: "L1", method: "get_computed_style", confidence: 1 }
      });

      (["::before", "::after"] as const).forEach((pseudoType) => {
        const pseudoStyle = getComputedStyle(element, pseudoType);
        const content = pseudoStyle.content;
        if (pseudoStyle.display === "none" || content === "none" || content === "normal" || content === "" || content === "\"\"") return;
        const pseudoId = `node_${String(++sequence).padStart(8, "0")}`;
        nodes.push({
          node_id: pseudoId,
          parent_node_id: nodeId,
          node_type: "pseudo",
          pseudo_type: pseudoType,
          owner_node_id: nodeId,
          sibling_index: pseudoType === "::before" ? -1 : node.childNodes.length,
          content,
          rendered: isVisible,
          provenance: { layer: "L0", method: "computed_pseudo_style", confidence: 1 }
        });
        boxes.push({
          node_id: pseudoId,
          bbox: rectValue(rect),
          geometry_approximation: "owner_bbox",
          provenance: { layer: "L1", method: "owner_bbox_approximation", confidence: 0.5 }
        });
        styles.push({
          node_id: pseudoId,
          properties: Object.fromEntries(styleProperties.map((property) => [property, pseudoStyle.getPropertyValue(property)])),
          provenance: { layer: "L1", method: "get_computed_style_pseudo", confidence: 1 }
        });
        if (pseudoStyle.backgroundImage !== "none") assets.push({
          node_id: pseudoId, owner_node_id: nodeId, type: "background_image", pseudo_type: pseudoType,
          source: pseudoStyle.backgroundImage, rendered: { width: rect.width, height: rect.height },
          provenance: { layer: "L1", method: "computed_background_image", confidence: 1 }
        });
      });

      if (element instanceof HTMLImageElement) {
        assets.push({ node_id: nodeId, type: "image", src: element.src, current_src: element.currentSrc, alt: element.alt,
          intrinsic: { width: element.naturalWidth, height: element.naturalHeight }, rendered: { width: rect.width, height: rect.height },
          loading: element.loading, decoding: element.decoding, fetch_priority: element.fetchPriority,
          srcset: element.srcset, sizes: element.sizes,
          responsive_candidates: element.parentElement instanceof HTMLPictureElement
            ? Array.from(element.parentElement.querySelectorAll("source")).map((source) => ({ srcset: source.srcset, sizes: source.sizes, media: source.media, type: source.type }))
            : [],
          cross_origin: element.crossOrigin, referrer_policy: element.referrerPolicy, complete: element.complete });
      } else if (element instanceof HTMLVideoElement) {
        assets.push({ node_id: nodeId, type: "video", src: element.currentSrc || element.src,
          poster: element.poster, intrinsic: { width: element.videoWidth, height: element.videoHeight },
          rendered: { width: rect.width, height: rect.height }, autoplay: element.autoplay, muted: element.muted,
          loop: element.loop, controls: element.controls, ready_state: element.readyState });
      } else if (element.localName === "svg") {
        assets.push({ node_id: nodeId, type: "svg", view_box: element.getAttribute("viewBox"),
          fill: style.fill, stroke: style.stroke, rendered: { width: rect.width, height: rect.height } });
      } else if (element instanceof HTMLCanvasElement) {
        assets.push({ node_id: nodeId, type: "canvas", intrinsic: { width: element.width, height: element.height },
          rendered: { width: rect.width, height: rect.height }, screenshot_evidence: "full_page_and_viewport" });
      }
      if (style.backgroundImage !== "none") assets.push({
        node_id: nodeId, type: "background_image", source: style.backgroundImage,
        rendered: { width: rect.width, height: rect.height },
        provenance: { layer: "L1", method: "computed_background_image", confidence: 1 }
      });

      Array.from(node.childNodes).forEach((child, index) => visit(child, nodeId, index, shadowHostId));
      const shadowRoot = (element as HTMLElement).shadowRoot;
      if (shadowRoot) Array.from(shadowRoot.childNodes).forEach((child, index) => visit(child, nodeId, index, nodeId));
    };

    visit(document.documentElement, null, 0);
    const customPropertyNames = new Set<string>();
    const serializeRules = (rules: CSSRuleList): Record<string, unknown>[] => Array.from(rules).map((rule, index) => {
      const record: Record<string, unknown> = { index, type: rule.type };
      if (rule instanceof CSSStyleRule) {
        record.selector = rule.selectorText;
        record.declarations = Array.from(rule.style).map((property) => {
          if (property.startsWith("--")) customPropertyNames.add(property);
          return { property, value: rule.style.getPropertyValue(property), priority: rule.style.getPropertyPriority(property) };
        });
      } else {
        // Keep a bounded css_text for non-style rules (media, keyframes, font-face wrappers).
        const cssText = rule.cssText;
        if (cssText.length > 2000) {
          record.css_text = cssText.slice(0, 2000);
          record.css_text_truncated = true;
          record.css_text_original_length = cssText.length;
        } else {
          record.css_text = cssText;
        }
      }
      const groupingRule = rule as CSSRule & { cssRules?: CSSRuleList; conditionText?: string };
      if (groupingRule.conditionText) record.condition = groupingRule.conditionText;
      if (groupingRule.cssRules) record.rules = serializeRules(groupingRule.cssRules);
      return record;
    });
    const stylesheets = Array.from(document.styleSheets).map((sheet, index) => {
      const owner = sheet.ownerNode as Element | null;
      try {
        return {
          stylesheet_id: `css_${String(index + 1).padStart(6, "0")}`,
          href: sheet.href,
          owner_tag: owner?.localName ?? null,
          owner_media: owner?.getAttribute("media") ?? null,
          disabled: sheet.disabled,
          accessible: true,
          rules: serializeRules(sheet.cssRules),
          provenance: { layer: "L0", method: "cssom", confidence: 1 }
        };
      } catch (error) {
        return {
          stylesheet_id: `css_${String(index + 1).padStart(6, "0")}`,
          href: sheet.href,
          owner_tag: owner?.localName ?? null,
          owner_media: owner?.getAttribute("media") ?? null,
          disabled: sheet.disabled,
          accessible: false,
          access_error: error instanceof Error ? error.name : "SecurityError",
          rules: [],
          provenance: { layer: "L0", method: "cssom", confidence: 1 }
        };
      }
    });
    const fontFaces: Record<string, unknown>[] = [];
    const collectFontFaces = (rules: CSSRuleList, stylesheetId: string) => Array.from(rules).forEach((rule, index) => {
      if (rule instanceof CSSFontFaceRule) {
        fontFaces.push({
          stylesheet_id: stylesheetId, rule_index: index,
          family: rule.style.getPropertyValue("font-family"), src: rule.style.getPropertyValue("src"),
          style: rule.style.getPropertyValue("font-style"), weight: rule.style.getPropertyValue("font-weight"),
          stretch: rule.style.getPropertyValue("font-stretch"), display: rule.style.getPropertyValue("font-display"),
          unicode_range: rule.style.getPropertyValue("unicode-range"), variation_settings: rule.style.getPropertyValue("font-variation-settings"),
          provenance: { layer: "L0", method: "cssom_font_face", confidence: 1 }
        });
      }
      const grouping = rule as CSSRule & { cssRules?: CSSRuleList };
      if (grouping.cssRules) collectFontFaces(grouping.cssRules, stylesheetId);
    });
    Array.from(document.styleSheets).forEach((sheet, index) => {
      try { collectFontFaces(sheet.cssRules, `css_${String(index + 1).padStart(6, "0")}`); } catch { /* inaccessible stylesheet */ }
    });
    document.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
      Array.from(element.style).forEach((property) => { if (property.startsWith("--")) customPropertyNames.add(property); });
    });
    const rootStyle = getComputedStyle(document.documentElement);
    const customProperties = [...customPropertyNames].sort().map((name) => ({
      name,
      computed_root_value: rootStyle.getPropertyValue(name).trim(),
      provenance: { layer: "L1", method: "computed_document_root", confidence: 1 }
    }));
    const fonts = Array.from(document.fonts).map((font) => ({
      family: font.family, style: font.style, weight: font.weight, stretch: font.stretch, status: font.status
    }));
    const motion: Record<string, unknown>[] = [];
    for (const [node, nodeId] of nodeIds.entries()) {
      if (!(node instanceof Element)) continue;
      const style = getComputedStyle(node);
      const hasTransition = style.transitionProperty.split(",").some((property, index) => {
        const durations = style.transitionDuration.split(",");
        const duration = durations[index] ?? durations[durations.length - 1] ?? "0s";
        return property.trim() !== "none" && duration.trim() !== "0s" && duration.trim() !== "0ms";
      });
      const hasAnimation = style.animationName.split(",").some((name) => name.trim() !== "none");
      if (hasTransition || hasAnimation) motion.push({
        motion_id: `mot_decl_${nodeId}`,
        source: "computed_css",
        node_id: nodeId,
        transition: hasTransition ? {
          property: style.transitionProperty,
          duration: style.transitionDuration,
          delay: style.transitionDelay,
          easing: style.transitionTimingFunction
        } : null,
        animation: hasAnimation ? {
          name: style.animationName,
          duration: style.animationDuration,
          delay: style.animationDelay,
          easing: style.animationTimingFunction,
          iteration_count: style.animationIterationCount,
          direction: style.animationDirection,
          fill_mode: style.animationFillMode,
          play_state: style.animationPlayState
        } : null,
        provenance: { layer: "L1", method: "computed_style_motion", confidence: 1 }
      });
    }
    document.getAnimations().forEach((animation, index) => {
      const effect = animation.effect instanceof KeyframeEffect ? animation.effect : null;
      const target = effect?.target instanceof Element ? effect.target : null;
      const keyframes = effect?.getKeyframes() ?? [];
      const animatedProperties = [...new Set(keyframes.flatMap((keyframe) => Object.keys(keyframe).filter((key) =>
        !["offset", "computedOffset", "easing", "composite"].includes(key))))].sort();
      motion.push({
        motion_id: `mot_runtime_${String(index + 1).padStart(6, "0")}`,
        source: animation instanceof CSSAnimation ? "css_animation" : animation instanceof CSSTransition ? "css_transition" : "web_animations_api",
        node_id: target ? nodeIds.get(target) ?? null : null,
        animation_name: animation instanceof CSSAnimation ? animation.animationName : null,
        transition_property: animation instanceof CSSTransition ? animation.transitionProperty : null,
        play_state: animation.playState,
        pending: animation.pending,
        current_time: animation.currentTime,
        start_time: animation.startTime,
        playback_rate: animation.playbackRate,
        timing: effect?.getTiming() ?? null,
        computed_timing: effect?.getComputedTiming() ?? null,
        keyframes,
        animated_properties: animatedProperties,
        compositor_friendly: animatedProperties.every((property) => property === "transform" || property === "opacity"),
        provenance: { layer: "L1", method: "web_animations_api", confidence: 1 }
      });
    });
    return {
      document: {
        width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
        height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
      },
      canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null,
      nodes,
      styles,
      boxes,
      textLines,
      assets,
      fonts,
      stylesheets,
      customProperties,
      motion,
      fontFaces
    };
  }, [...STYLE_PROPERTIES]);
}
