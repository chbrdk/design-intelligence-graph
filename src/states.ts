import type { Page } from "playwright";
import type { ArtifactReference } from "./types.js";
import type { MatchableNode } from "./matching.js";
import { writeArtifact } from "./io.js";
import { screenshotOptions, screenshotSettings } from "./screenshot-settings.js";

const STATE_STYLE_PROPERTIES = [
  "color", "background-color", "border-top-color", "border-right-color", "border-bottom-color",
  "border-left-color", "box-shadow", "opacity", "transform", "outline-color", "outline-style",
  "outline-width", "text-decoration-color", "text-decoration-line", "cursor"
] as const;

export type SafeState = "hover" | "focus";

export interface StateCandidate {
  node_id: string;
  dom_path: string;
  tag: string;
  states: SafeState[];
}

export interface StateCaptureRecord {
  state_capture_id: string;
  node_id: string;
  state: SafeState;
  trigger: { action: SafeState; selector: string };
  captured_at: string;
  style_delta: Record<string, { before: string; after: string }>;
  geometry_delta: Record<string, { before: number; after: number }>;
  screenshot: ArtifactReference;
  restoration: { attempted: true; successful: boolean };
  provenance: { layer: "L1"; method: string; confidence: 1 };
}

export function selectStateCandidates(nodes: MatchableNode[], limit = 8): StateCandidate[] {
  const interactiveTags = new Set(["a", "button", "input", "select", "textarea", "summary"]);
  return nodes.flatMap((node): StateCandidate[] => {
    if (node.node_type !== "element" || !node.rendered || !node.node_id || !node.dom_path || !node.tag) return [];
    const role = node.attributes?.role;
    const isInteractive = interactiveTags.has(node.tag) || role === "button" || role === "link" || role === "checkbox" || role === "tab";
    if (!isInteractive || "disabled" in (node.attributes ?? {}) || node.attributes?.["aria-disabled"] === "true") return [];
    const states: SafeState[] = node.tag === "input" || node.tag === "select" || node.tag === "textarea"
      ? ["hover", "focus"] : ["hover", "focus"];
    return [{ node_id: node.node_id, dom_path: node.dom_path, tag: node.tag, states }];
  }).slice(0, limit);
}

export function diffValues<T extends string | number>(before: Record<string, T>, after: Record<string, T>): Record<string, { before: T; after: T }> {
  return Object.fromEntries(Object.keys(before).flatMap((key) => before[key] !== after[key]
    ? [[key, { before: before[key]!, after: after[key]! }]] : []));
}

async function measure(page: Page, selector: string): Promise<{ styles: Record<string, string>; geometry: Record<string, number> }> {
  return page.locator(selector).evaluate((element, properties) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      styles: Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)])),
      geometry: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
    };
  }, [...STATE_STYLE_PROPERTIES]);
}

export async function captureSafeStates(
  page: Page,
  nodes: MatchableNode[],
  packageRoot: string,
  viewportPrefix: string
): Promise<{ records: StateCaptureRecord[]; artifacts: Record<string, ArtifactReference>; warnings: string[] }> {
  const records: StateCaptureRecord[] = [];
  const artifacts: Record<string, ArtifactReference> = {};
  const warnings: string[] = [];
  const candidates = selectStateCandidates(nodes);
  let sequence = 0;
  for (const candidate of candidates) {
    const locator = page.locator(candidate.dom_path);
    if (await locator.count() !== 1) {
      warnings.push(`state_target_not_unique:${candidate.node_id}`);
      continue;
    }
    for (const state of candidate.states) {
      const stateSequence = String(++sequence).padStart(4, "0");
      const scrollBefore = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      try {
        const before = await measure(page, candidate.dom_path);
        if (state === "hover") await locator.hover({ timeout: 3000 });
        else await locator.focus({ timeout: 3000 });
        await page.waitForTimeout(100);
        const after = await measure(page, candidate.dom_path);
        const shot = screenshotSettings();
        const screenshot = await page.screenshot(screenshotOptions(false));
        const screenshotArtifact = await writeArtifact(
          packageRoot,
          `${viewportPrefix}/states/${stateSequence}-${candidate.node_id}-${state}${shot.extension}`,
          screenshot,
          shot.mediaType
        );
        artifacts[`state_${stateSequence}_${state}_screenshot`] = screenshotArtifact;
        let restored = true;
        try {
          if (state === "hover") await page.mouse.move(-10, -10);
          else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          await page.evaluate((position) => scrollTo(position.x, position.y), scrollBefore);
        } catch { restored = false; }
        records.push({
          state_capture_id: `stc_${candidate.node_id}_${state}`,
          node_id: candidate.node_id,
          state,
          trigger: { action: state, selector: candidate.dom_path },
          captured_at: new Date().toISOString(),
          style_delta: diffValues(before.styles, after.styles),
          geometry_delta: diffValues(before.geometry, after.geometry),
          screenshot: screenshotArtifact,
          restoration: { attempted: true, successful: restored },
          provenance: { layer: "L1", method: `playwright_${state}`, confidence: 1 }
        });
      } catch (error) {
        warnings.push(`state_capture_failed:${candidate.node_id}:${state}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { records, artifacts, warnings };
}
