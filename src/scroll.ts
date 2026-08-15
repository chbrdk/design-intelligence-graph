import type { Page } from "playwright";
import type { MatchableNode } from "./matching.js";
import type { MeasuredStyle } from "./responsive.js";
import type { ArtifactReference } from "./types.js";
import { writeArtifact } from "./io.js";
import { screenshotOptions, screenshotSettings } from "./screenshot-settings.js";

export interface ScrollTarget {
  node_id: string;
  selector: string;
  position: "fixed" | "sticky";
  top: string;
}

export interface ScrollSample {
  sample_index: number;
  requested_offset: number;
  actual_offset: number;
  document_height: number;
  viewport_height: number;
  positioned_elements: Array<{
    node_id: string;
    position: "fixed" | "sticky";
    viewport_x: number;
    viewport_y: number;
    width: number;
    height: number;
    in_viewport: boolean;
    sticky_active: boolean;
  }>;
  screenshot: ArtifactReference;
  provenance: { layer: "L1"; method: "deterministic_scroll_sample"; confidence: 1 };
}

export function buildScrollOffsets(documentHeight: number, viewportHeight: number): number[] {
  const maximum = Math.max(0, documentHeight - viewportHeight);
  if (maximum === 0) return [0];
  return [...new Set([0, Math.min(viewportHeight, maximum), Math.round(maximum / 2), maximum])].sort((a, b) => a - b);
}

export function selectPositionedTargets(nodes: MatchableNode[], styles: MeasuredStyle[]): ScrollTarget[] {
  const stylesByNode = new Map(styles.map((style) => [style.node_id, style.properties ?? {}]));
  return nodes.flatMap((node): ScrollTarget[] => {
    if (node.node_type !== "element" || !node.dom_path || !node.node_id) return [];
    const properties = stylesByNode.get(node.node_id);
    const position = properties?.position;
    if (position !== "fixed" && position !== "sticky") return [];
    return [{ node_id: node.node_id, selector: node.dom_path, position, top: properties?.["top"] ?? "auto" }];
  });
}

export async function captureScrollEvidence(
  page: Page,
  nodes: MatchableNode[],
  styles: MeasuredStyle[],
  packageRoot: string,
  viewportPrefix: string
): Promise<{ samples: ScrollSample[]; artifacts: Record<string, ArtifactReference>; restored: boolean; warnings: string[] }> {
  const initialOffset = await page.evaluate(() => scrollY);
  const dimensions = await page.evaluate(() => ({ documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight }));
  const offsets = buildScrollOffsets(dimensions.documentHeight, dimensions.viewportHeight);
  const targets = selectPositionedTargets(nodes, styles);
  const samples: ScrollSample[] = [];
  const artifacts: Record<string, ArtifactReference> = {};
  const warnings: string[] = [];
  for (let index = 0; index < offsets.length; index++) {
    const requestedOffset = offsets[index]!;
    await page.evaluate((offset) => scrollTo(0, offset), requestedOffset);
    await page.waitForTimeout(100);
    const observation = await page.evaluate((positionedTargets) => {
      const elements = positionedTargets.flatMap((target) => {
        const element = document.querySelector(target.selector);
        if (!element) return [];
        const rect = element.getBoundingClientRect();
        const configuredTop = Number.parseFloat(target.top);
        const stickyActive = target.position === "fixed" || (
          scrollY > 0 && Number.isFinite(configuredTop) && Math.abs(rect.top - configuredTop) <= 2
        );
        return [{
          node_id: target.node_id, position: target.position, viewport_x: rect.x, viewport_y: rect.y,
          width: rect.width, height: rect.height,
          in_viewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth,
          sticky_active: stickyActive
        }];
      });
      return {
        actualOffset: scrollY,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        elements
      };
    }, targets);
    const shot = screenshotSettings();
    const screenshot = await page.screenshot(screenshotOptions(false));
    const screenshotArtifact = await writeArtifact(
      packageRoot,
      `${viewportPrefix}/scroll/${String(index + 1).padStart(2, "0")}-${Math.round(observation.actualOffset)}${shot.extension}`,
      screenshot,
      shot.mediaType
    );
    artifacts[`scroll_${String(index + 1).padStart(2, "0")}_screenshot`] = screenshotArtifact;
    samples.push({
      sample_index: index,
      requested_offset: requestedOffset,
      actual_offset: observation.actualOffset,
      document_height: observation.documentHeight,
      viewport_height: observation.viewportHeight,
      positioned_elements: observation.elements,
      screenshot: screenshotArtifact,
      provenance: { layer: "L1", method: "deterministic_scroll_sample", confidence: 1 }
    });
  }
  let restored = true;
  try {
    await page.evaluate((offset) => scrollTo(0, offset), initialOffset);
  } catch (error) {
    restored = false;
    warnings.push(`scroll_restoration_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  return { samples, artifacts, restored, warnings };
}
