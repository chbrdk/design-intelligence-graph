import type { Frame, Page } from "playwright";
import { sanitizeUrl } from "./network.js";
import { writeArtifact } from "./io.js";
import type { ArtifactReference, CaptureStatus } from "./types.js";
import { sanitizeHtml } from "./privacy.js";

export interface FrameEvidence {
  frame_id: string;
  parent_frame_id: string | null;
  name: string;
  url: string;
  origin: string;
  is_main_frame: boolean;
  same_origin: boolean;
  sandbox: string | null;
  geometry: { x: number; y: number; width: number; height: number } | null;
  content_status: CaptureStatus;
  content_artifact?: ArtifactReference;
  restrictions: string[];
  provenance: { layer: "L0" | "L1"; method: string; confidence: 1 };
}

function safeOrigin(rawUrl: string): string {
  try { return new URL(rawUrl).origin; } catch { return "null"; }
}

export async function captureFrameEvidence(
  page: Page,
  packageRoot: string,
  viewportPrefix: string
): Promise<{ frames: FrameEvidence[]; artifacts: Record<string, ArtifactReference>; warnings: string[] }> {
  const pageFrames = page.frames();
  const ids = new Map<Frame, string>(pageFrames.map((frame, index) => [frame, `frm_${String(index + 1).padStart(6, "0")}`]));
  const mainOrigin = safeOrigin(page.mainFrame().url());
  const frames: FrameEvidence[] = [];
  const artifacts: Record<string, ArtifactReference> = {};
  const warnings: string[] = [];
  for (const frame of pageFrames) {
    const frameId = ids.get(frame)!;
    const isMain = frame === page.mainFrame();
    const frameUrl = frame.url();
    const origin = safeOrigin(frameUrl);
    const sameOrigin = isMain || frameUrl === "about:blank" || frameUrl === "about:srcdoc" || origin === mainOrigin;
    let sandbox: string | null = null;
    let geometry: FrameEvidence["geometry"] = null;
    if (!isMain) {
      try {
        const element = await frame.frameElement();
        const details = await element.evaluate((iframe) => {
          const frameElement = iframe as HTMLIFrameElement;
          const rect = frameElement.getBoundingClientRect();
          return {
            sandbox: frameElement.getAttribute("sandbox"),
            geometry: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
          };
        });
        sandbox = details.sandbox;
        geometry = details.geometry;
      } catch (error) {
        warnings.push(`frame_geometry_unavailable:${frameId}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
    let contentStatus: CaptureStatus = sameOrigin ? "complete" : "unsupported";
    let contentArtifact: ArtifactReference | undefined;
    const restrictions: string[] = [];
    if (sameOrigin) {
      try {
        contentArtifact = await writeArtifact(
          packageRoot,
          `${viewportPrefix}/frames/${frameId}/rendered.html`,
          sanitizeHtml(await frame.content(), frameUrl === "about:srcdoc" ? page.url() : frameUrl),
          "text/html; charset=utf-8"
        );
        artifacts[`frame_${frameId}_rendered_html`] = contentArtifact;
      } catch (error) {
        contentStatus = "partial";
        restrictions.push("rendered_html_unavailable");
        warnings.push(`frame_content_unavailable:${frameId}:${error instanceof Error ? error.message : String(error)}`);
      }
    } else restrictions.push("cross_origin_content_not_captured");
    frames.push({
      frame_id: frameId,
      parent_frame_id: frame.parentFrame() ? ids.get(frame.parentFrame()!) ?? null : null,
      name: frame.name(),
      url: sanitizeUrl(frameUrl),
      origin,
      is_main_frame: isMain,
      same_origin: sameOrigin,
      sandbox,
      geometry,
      content_status: contentStatus,
      ...(contentArtifact ? { content_artifact: contentArtifact } : {}),
      restrictions,
      provenance: { layer: geometry ? "L1" : "L0", method: "playwright_frame_tree", confidence: 1 }
    });
  }
  return { frames, artifacts, warnings };
}
