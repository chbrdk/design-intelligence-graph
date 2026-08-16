/**
 * Rebuild-oriented design token pack from measured visual-language evidence.
 * Emits DIG roles + DTCG-shaped tokens (Format Module 2025.10-aligned primitives).
 */

import { writeArtifact } from "./io.js";
import type { VisualLanguageViewport } from "./visual-language.js";
import type { ArtifactReference } from "./types.js";
import { loadDigPaths } from "./runtime-paths.js";

export const DESIGN_TOKENS_VERSION = "0.1.0";
export const DESIGN_TOKENS_RELATIVE_PATH = "derived/design-tokens.json";

export type DigColorRole = "bg" | "ink" | "accent" | "muted" | "border" | "transparent";

export interface DigColorToken {
  hex: string;
  hex_rgb: string;
  role: DigColorRole;
  occurrences: number;
  source_roles: string[];
}

export interface DigTypeToken {
  role: "display" | "body" | "emphasis" | "small";
  family: string;
  families: string[];
  size_px: number;
  weight: number;
  line_height: string;
  occurrences: number;
}

export interface DigRadiusToken {
  role: "sm" | "md" | "lg" | "xl" | "pill";
  value_px: number;
  occurrences: number;
}

export interface DesignTokensDocument {
  schema_version: "0.1.0";
  design_tokens_version: typeof DESIGN_TOKENS_VERSION;
  generated_at: string;
  source: {
    viewport_name: string;
    viewport_capture_id: string;
    visual_language_path: string;
  };
  /** Role-oriented pack for rebuild agents (prefer this over inventing). */
  roles: {
    colors: DigColorToken[];
    typography: DigTypeToken[];
    radii: DigRadiusToken[];
    motion: {
      animated: boolean;
      properties: string[];
      runtime_instances: number;
    };
  };
  recipes: {
    primary_cta: { style: "fill" | "outline" | "ghost"; fill: string | null; ink: string | null; radius_px: number | null; notes: string };
    scrim: { style: "dark_gradient" | "light_wash" | "none"; stops: string[]; notes: string };
    surface: { bg: string | null; ink: string | null; notes: string };
  };
  /** DTCG-shaped primitives for tool interchange. */
  dtcg: Record<string, unknown>;
}

function parsePx(value: string): number | null {
  const match = value.trim().match(/^(-?[\d.]+)px$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const full = raw.length === 8 ? raw.slice(0, 6) : raw.slice(0, 6);
  if (full.length !== 6) return 0;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexRgb(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length >= 6) return `#${raw.slice(0, 6).toLowerCase()}`;
  return hex.toLowerCase();
}

function alphaOf(hex: string): number {
  const raw = hex.replace("#", "");
  if (raw.length === 8) return Number.parseInt(raw.slice(6, 8), 16) / 255;
  return 1;
}

function parseFamilies(family: string): string[] {
  return family
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function primaryFamily(family: string): string {
  return parseFamilies(family)[0] || family || "sans-serif";
}

function pickViewport(viewports: VisualLanguageViewport[]): VisualLanguageViewport | null {
  if (!viewports.length) return null;
  const desktop = viewports.find((item) => /desktop/i.test(item.viewport_name));
  return desktop ?? viewports[0] ?? null;
}

export function guessColorRole(
  color: { hex: string; roles: string[]; occurrences: number },
  ranked: { bg?: string; ink?: string }
): DigColorRole {
  const a = alphaOf(color.hex);
  if (a < 0.08) return "transparent";
  const lum = luminance(color.hex);
  const hasBg = color.roles.includes("background");
  const hasFg = color.roles.includes("foreground");
  const hasBorder = color.roles.includes("border");
  if (!ranked.bg && hasBg && lum < 0.25 && a > 0.85) return "bg";
  if (!ranked.ink && hasFg && lum > 0.75 && a > 0.85) return "ink";
  if (hasBorder && !hasBg && lum > 0.35 && lum < 0.85) return "border";
  if (lum > 0.15 && lum < 0.85 && a > 0.5 && (hasFg || hasBg)) return "accent";
  if (a < 0.85) return "muted";
  if (!ranked.bg && hasBg && lum < 0.35) return "bg";
  if (!ranked.ink && hasFg && lum > 0.65) return "ink";
  return hasBorder ? "border" : "muted";
}

export function deriveDesignTokens(
  viewports: VisualLanguageViewport[],
  options: { maxColors?: number; maxTypeStyles?: number } = {}
): DesignTokensDocument | null {
  const paths = loadDigPaths() as { designTokens?: { maxColors?: number; maxTypeStyles?: number; relativePath?: string } };
  const maxColors = options.maxColors ?? paths.designTokens?.maxColors ?? 8;
  const maxTypeStyles = options.maxTypeStyles ?? paths.designTokens?.maxTypeStyles ?? 5;
  const viewport = pickViewport(viewports);
  if (!viewport) return null;

  const ranked: { bg?: string; ink?: string } = {};
  const colors: DigColorToken[] = [];
  const sortedColors = [...viewport.color_palette].sort((a, b) => b.occurrences - a.occurrences);
  for (const color of sortedColors) {
    if (colors.length >= maxColors) break;
    const role = guessColorRole(color, ranked);
    if (role === "transparent") continue;
    if (role === "bg" && !ranked.bg) ranked.bg = hexRgb(color.hex);
    if (role === "ink" && !ranked.ink) ranked.ink = hexRgb(color.hex);
    // Prefer unique rgb for pack; keep first role assignment.
    if (colors.some((item) => item.hex_rgb === hexRgb(color.hex))) continue;
    colors.push({
      hex: color.hex.toLowerCase(),
      hex_rgb: hexRgb(color.hex),
      role,
      occurrences: color.occurrences,
      source_roles: color.roles
    });
  }
  // Ensure we have bg/ink guesses even if role assignment was sparse.
  if (!ranked.bg && colors[0]) {
    const darkest = [...colors].sort((a, b) => luminance(a.hex_rgb) - luminance(b.hex_rgb))[0];
    if (darkest) {
      darkest.role = "bg";
      ranked.bg = darkest.hex_rgb;
    }
  }
  if (!ranked.ink && colors.length) {
    const lightest = [...colors].sort((a, b) => luminance(b.hex_rgb) - luminance(a.hex_rgb))[0];
    if (lightest && lightest.role !== "bg") {
      lightest.role = "ink";
      ranked.ink = lightest.hex_rgb;
    }
  }

  const typography: DigTypeToken[] = [];
  const typeSorted = [...viewport.typography].sort((a, b) => {
    const sa = parsePx(a.font_size) ?? 0;
    const sb = parsePx(b.font_size) ?? 0;
    return b.occurrences - a.occurrences || sb - sa;
  });
  const body = typeSorted[0];
  if (body) {
    typography.push({
      role: "body",
      family: primaryFamily(body.font_family),
      families: parseFamilies(body.font_family),
      size_px: parsePx(body.font_size) ?? 16,
      weight: Number.parseInt(body.font_weight, 10) || 400,
      line_height: body.line_height || "normal",
      occurrences: body.occurrences
    });
  }
  const display = [...typeSorted]
    .filter((item) => (parsePx(item.font_size) ?? 0) >= (typography[0]?.size_px ?? 16) + 4)
    .sort((a, b) => (parsePx(b.font_size) ?? 0) - (parsePx(a.font_size) ?? 0))[0];
  if (display) {
    typography.push({
      role: "display",
      family: primaryFamily(display.font_family),
      families: parseFamilies(display.font_family),
      size_px: parsePx(display.font_size) ?? 24,
      weight: Number.parseInt(display.font_weight, 10) || 600,
      line_height: display.line_height || "normal",
      occurrences: display.occurrences
    });
  }
  const emphasis = typeSorted.find((item) => (Number.parseInt(item.font_weight, 10) || 400) >= 600);
  if (emphasis && !typography.some((item) => item.role === "emphasis")) {
    typography.push({
      role: "emphasis",
      family: primaryFamily(emphasis.font_family),
      families: parseFamilies(emphasis.font_family),
      size_px: parsePx(emphasis.font_size) ?? 16,
      weight: Number.parseInt(emphasis.font_weight, 10) || 600,
      line_height: emphasis.line_height || "normal",
      occurrences: emphasis.occurrences
    });
  }
  const small = typeSorted.find((item) => (parsePx(item.font_size) ?? 99) < (typography[0]?.size_px ?? 16));
  if (small && typography.length < maxTypeStyles) {
    typography.push({
      role: "small",
      family: primaryFamily(small.font_family),
      families: parseFamilies(small.font_family),
      size_px: parsePx(small.font_size) ?? 14,
      weight: Number.parseInt(small.font_weight, 10) || 400,
      line_height: small.line_height || "normal",
      occurrences: small.occurrences
    });
  }

  const radii: DigRadiusToken[] = [];
  const radiusRoleOrder: DigRadiusToken["role"][] = ["sm", "md", "lg", "xl", "pill"];
  const radiusValues = viewport.shape.border_radius_values
    .map((item) => ({ px: parsePx(item.value), occurrences: item.occurrences, raw: item.value }))
    .filter((item): item is { px: number; occurrences: number; raw: string } => item.px !== null && item.px >= 1 && item.px <= 64)
    .sort((a, b) => a.px - b.px);
  // Dedupe near-equal radii.
  const uniqueRadii: Array<{ px: number; occurrences: number }> = [];
  for (const item of radiusValues) {
    const near = uniqueRadii.find((existing) => Math.abs(existing.px - item.px) < 1.5);
    if (near) near.occurrences += item.occurrences;
    else uniqueRadii.push({ px: Math.round(item.px), occurrences: item.occurrences });
  }
  const pillish = viewport.shape.border_radius_values.find((item) => item.value === "50%" || item.value === "100%");
  for (let i = 0; i < Math.min(uniqueRadii.length, 4); i += 1) {
    const item = uniqueRadii[i]!;
    radii.push({ role: radiusRoleOrder[i] ?? "md", value_px: item.px, occurrences: item.occurrences });
  }
  if (pillish) {
    radii.push({ role: "pill", value_px: 999, occurrences: pillish.occurrences });
  }

  const bg = ranked.bg ?? colors.find((item) => item.role === "bg")?.hex_rgb ?? null;
  const ink = ranked.ink ?? colors.find((item) => item.role === "ink")?.hex_rgb ?? null;
  const accent = colors.find((item) => item.role === "accent")?.hex_rgb ?? null;
  const darkSurface = bg ? luminance(bg) < 0.35 : true;
  const ctaRadius = radii.find((item) => item.role === "md" || item.role === "lg")?.value_px ?? radii[0]?.value_px ?? null;

  const recipes: DesignTokensDocument["recipes"] = {
    primary_cta: darkSurface
      ? {
          style: "outline",
          fill: null,
          ink: ink ?? "#ffffff",
          radius_px: ctaRadius,
          notes: "Dark hero surface → light outline / translucent CTA chrome (Porsche-like)."
        }
      : {
          style: "fill",
          fill: bg ?? "#111111",
          ink: ink ?? "#ffffff",
          radius_px: ctaRadius,
          notes: "Light surface → high-contrast filled CTA."
        },
    scrim: darkSurface
      ? {
          style: "dark_gradient",
          stops: [bg ?? "#000000", `${bg ?? "#000000"}00`],
          notes: "Prefer bottom/edge dark scrim over media for headline/CTA legibility."
        }
      : {
          style: "light_wash",
          stops: [ink ?? "#ffffff", `${ink ?? "#ffffff"}00`],
          notes: "Light wash if media is bright and ink is dark."
        },
    surface: {
      bg,
      ink,
      notes: accent ? `Accent candidate ${accent}; keep restrained.` : "Monochrome-leaning palette from measured fills/text."
    }
  };

  const dtcg: Record<string, unknown> = {
    color: Object.fromEntries(
      colors.map((color) => [
        color.role === "bg" || color.role === "ink" || color.role === "accent"
          ? color.role
          : `${color.role}.${color.hex_rgb.replace("#", "")}`,
        {
          $type: "color",
          $value: color.hex_rgb,
          $extensions: { "dig.role": color.role, "dig.occurrences": color.occurrences }
        }
      ])
    ),
    fontFamily: {
      brand: {
        $type: "fontFamily",
        $value: typography[0]?.families?.length ? typography[0].families : [typography[0]?.family ?? "sans-serif"]
      }
    },
    fontSize: Object.fromEntries(
      typography.map((item) => [
        item.role,
        { $type: "dimension", $value: { value: item.size_px, unit: "px" } }
      ])
    ),
    fontWeight: Object.fromEntries(
      typography.map((item) => [item.role, { $type: "fontWeight", $value: item.weight }])
    ),
    borderRadius: Object.fromEntries(
      radii
        .filter((item) => item.role !== "pill")
        .map((item) => [item.role, { $type: "dimension", $value: { value: item.value_px, unit: "px" } }])
    )
  };

  return {
    schema_version: "0.1.0",
    design_tokens_version: DESIGN_TOKENS_VERSION,
    generated_at: new Date().toISOString(),
    source: {
      viewport_name: viewport.viewport_name,
      viewport_capture_id: viewport.viewport_capture_id,
      visual_language_path: "derived/visual-language.json"
    },
    roles: {
      colors,
      typography,
      radii,
      motion: {
        animated: (viewport.motion.runtime_instances ?? 0) > 0 || (viewport.motion.total ?? 0) > 0,
        properties: viewport.motion.animated_properties ?? [],
        runtime_instances: viewport.motion.runtime_instances ?? 0
      }
    },
    recipes,
    dtcg
  };
}

export function formatDesignTokensBriefSection(tokens: DesignTokensDocument): string {
  const lines: string[] = [];
  lines.push("## Design tokens (measured)");
  lines.push("");
  lines.push(`Source viewport: \`${tokens.source.viewport_name}\` · do not invent fonts/colors when these exist.`);
  lines.push("");
  const colorLine = tokens.roles.colors
    .map((item) => `${item.role}=${item.hex_rgb}`)
    .join(", ");
  lines.push(`- Colors: ${colorLine || "—"}`);
  for (const type of tokens.roles.typography) {
    lines.push(
      `- Type ${type.role}: ${type.family} ${type.size_px}px / ${type.weight}`
    );
  }
  const radiusLine = tokens.roles.radii.map((item) => `${item.role}=${item.value_px}px`).join(", ");
  lines.push(`- Radii: ${radiusLine || "—"}`);
  lines.push(
    `- Motion: ${tokens.roles.motion.animated ? "animated" : "static"} (${tokens.roles.motion.properties.slice(0, 6).join(", ") || "—"})`
  );
  lines.push(
    `- CTA recipe: ${tokens.recipes.primary_cta.style}` +
      `${tokens.recipes.primary_cta.fill ? ` fill ${tokens.recipes.primary_cta.fill}` : ""}` +
      `${tokens.recipes.primary_cta.ink ? ` ink ${tokens.recipes.primary_cta.ink}` : ""}` +
      `${tokens.recipes.primary_cta.radius_px != null ? ` radius ${tokens.recipes.primary_cta.radius_px}px` : ""}`
  );
  lines.push(`- Scrim: ${tokens.recipes.scrim.style} (${tokens.recipes.scrim.stops.join(" → ")})`);
  lines.push("");
  return lines.join("\n");
}

export async function emitDesignTokensForPackage(
  packageRoot: string,
  viewports: VisualLanguageViewport[]
): Promise<{ path: string; artifact: ArtifactReference; document: DesignTokensDocument } | null> {
  const document = deriveDesignTokens(viewports);
  if (!document) return null;
  const relative =
    (loadDigPaths() as { designTokens?: { relativePath?: string } }).designTokens?.relativePath ??
    DESIGN_TOKENS_RELATIVE_PATH;
  const artifact = await writeArtifact(packageRoot, relative, JSON.stringify(document, null, 2), "application/json");
  return { path: relative, artifact, document };
}
