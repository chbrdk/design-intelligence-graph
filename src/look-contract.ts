/**
 * Hard look contract for LLM / Figma agents — measured tokens + anti-generic avoid list.
 * Stops glassmorphic default aesthetics when a captured screen is the reference.
 */

import type { DesignTokensDocument } from "./design-tokens.js";

export const LOOK_CONTRACT_VERSION = "0.1.0" as const;

export const GENERIC_AI_AVOID = [
  "glassmorphism / frosted-blur panels",
  "generic purple-to-blue AI gradients",
  "equal three-up card grid as the whole page",
  "soft 3D abstract blobs / neon orbs",
  "Inter-only UI kit with 16px radius cards"
] as const;

export type LookContractColors = {
  bg: string | null;
  ink: string | null;
  accent: string | null;
};

export type LookContractType = {
  display: string | null;
  body: string | null;
};

export type LookContract = {
  schema_version: "0.1.0";
  look_contract_version: typeof LOOK_CONTRACT_VERSION;
  colors: LookContractColors;
  typography: LookContractType;
  radius_px: number | null;
  cta_chrome: "fill" | "outline" | "ghost" | null;
  density: "tight" | "airy" | "uneven" | null;
  avoid: string[];
};

/** Compact colors/type/radii as stored on DesignReference records (not DTCG roles). */
export type CompactLookTokens = {
  colors?: Array<{ hex?: string; hex_rgb?: string; roles?: string[] }>;
  typography?: Array<{
    family?: string;
    size?: string;
    size_px?: number;
    weight?: string | number;
    role?: string;
  }>;
  radii?: Array<string | number | { value_px?: number; role?: string }>;
  style_labels?: string[];
};

function colorByRole(tokens: DesignTokensDocument | null | undefined, role: "bg" | "ink" | "accent"): string | null {
  const hit = tokens?.roles.colors.find((item) => item.role === role);
  return hit?.hex_rgb ?? null;
}

function typeLine(
  tokens: DesignTokensDocument | null | undefined,
  role: "display" | "body"
): string | null {
  const hit = tokens?.roles.typography.find((item) => item.role === role);
  if (!hit) return null;
  return `${hit.family} ${hit.size_px}px / ${hit.weight}`;
}

function radiusPx(tokens: DesignTokensDocument | null | undefined): number | null {
  const cta = tokens?.recipes.primary_cta.radius_px;
  if (typeof cta === "number" && Number.isFinite(cta)) return cta;
  const md = tokens?.roles.radii.find((item) => item.role === "md" || item.role === "lg");
  return md?.value_px ?? tokens?.roles.radii[0]?.value_px ?? null;
}

function hexOf(color: { hex?: string; hex_rgb?: string } | undefined): string | null {
  const value = color?.hex_rgb ?? color?.hex;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.startsWith("#") ? trimmed : trimmed ? `#${trimmed}` : null;
}

function roleHay(roles: string[] | undefined): string {
  return (roles ?? []).map((item) => item.toLowerCase()).join(" ");
}

function colorFromCompact(tokens: CompactLookTokens | null | undefined, role: "bg" | "ink" | "accent"): string | null {
  const needles =
    role === "bg"
      ? ["bg", "background"]
      : role === "ink"
        ? ["ink", "foreground", "text"]
        : ["accent", "cta", "primary"];
  const hit = tokens?.colors?.find((item) => needles.some((needle) => roleHay(item.roles).includes(needle)));
  if (hit) return hexOf(hit);
  const fallbackIndex = role === "bg" ? 0 : role === "ink" ? 1 : 2;
  return hexOf(tokens?.colors?.[fallbackIndex]);
}

function typeFromCompact(tokens: CompactLookTokens | null | undefined, role: "display" | "body"): string | null {
  const hit =
    tokens?.typography?.find((item) => (item.role ?? "").toLowerCase() === role) ??
    (role === "display" ? tokens?.typography?.[0] : tokens?.typography?.[1]);
  if (!hit?.family) return null;
  const size =
    typeof hit.size_px === "number"
      ? `${hit.size_px}px`
      : typeof hit.size === "string"
        ? hit.size
        : null;
  const weight = hit.weight != null ? String(hit.weight) : null;
  return [hit.family, size, weight ? `/ ${weight}` : null].filter(Boolean).join(" ");
}

function radiusFromCompact(tokens: CompactLookTokens | null | undefined): number | null {
  const first = tokens?.radii?.[0];
  if (typeof first === "number" && Number.isFinite(first)) return first;
  if (typeof first === "string") {
    const match = first.trim().match(/^(-?[\d.]+)px$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (first && typeof first === "object" && typeof first.value_px === "number") return first.value_px;
  return null;
}

export function densityFromSpacing(spacingFeel: string | null | undefined): LookContract["density"] {
  if (!spacingFeel) return null;
  const hay = spacingFeel.toLowerCase();
  if (hay.includes("tight") || hay.includes("dense") || hay.includes("compact")) return "tight";
  if (hay.includes("uneven") || hay.includes("irregular")) return "uneven";
  if (hay.includes("airy") || hay.includes("generous") || hay.includes("open")) return "airy";
  return null;
}

export function contextualAvoid(input: {
  layout?: string | null;
  style?: string | null;
  cta_chrome?: LookContract["cta_chrome"];
}): string[] {
  const extra: string[] = [];
  const layout = (input.layout ?? "").toLowerCase();
  const style = (input.style ?? "").toLowerCase();
  if (layout.includes("full-bleed") || style.includes("photographic") || style.includes("high-energy")) {
    extra.push("card grid in the hero");
  }
  if (input.cta_chrome === "outline") {
    extra.push("filled neon gradient CTAs");
  }
  if (style.includes("minimal") || style.includes("corporate")) {
    extra.push("heavy drop shadows and floating glass cards");
  }
  return extra;
}

export function buildLookContract(input: {
  tokens?: DesignTokensDocument | null;
  compact_tokens?: CompactLookTokens | null;
  spacing_feel?: string | null;
  layout?: string | null;
  style?: string | null;
}): LookContract {
  const tokens = input.tokens ?? null;
  const compact = input.compact_tokens ?? null;
  const cta = tokens?.recipes.primary_cta.style ?? null;
  const style = input.style ?? compact?.style_labels?.[0] ?? null;
  const avoid = [
    ...GENERIC_AI_AVOID,
    ...contextualAvoid({
      layout: input.layout ?? null,
      style,
      cta_chrome: cta
    })
  ];
  const seen = new Set<string>();
  const uniqueAvoid = avoid.filter((item) => {
    if (seen.has(item)) return false;
    seen.add(item);
    return true;
  });

  return {
    schema_version: "0.1.0",
    look_contract_version: LOOK_CONTRACT_VERSION,
    colors: {
      bg: colorByRole(tokens, "bg") ?? colorFromCompact(compact, "bg"),
      ink: colorByRole(tokens, "ink") ?? colorFromCompact(compact, "ink"),
      accent: colorByRole(tokens, "accent") ?? colorFromCompact(compact, "accent")
    },
    typography: {
      display: typeLine(tokens, "display") ?? typeFromCompact(compact, "display"),
      body: typeLine(tokens, "body") ?? typeFromCompact(compact, "body")
    },
    radius_px: radiusPx(tokens) ?? radiusFromCompact(compact),
    cta_chrome: cta,
    density: densityFromSpacing(input.spacing_feel),
    avoid: uniqueAvoid
  };
}

export function asLookContract(raw: unknown): LookContract | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Partial<LookContract> & { colors?: Partial<LookContractColors>; typography?: Partial<LookContractType> };
  if (!rec.colors && !Array.isArray(rec.avoid) && rec.radius_px == null && !rec.cta_chrome) return null;
  const chrome = rec.cta_chrome;
  const density = rec.density;
  return {
    schema_version: "0.1.0",
    look_contract_version: LOOK_CONTRACT_VERSION,
    colors: {
      bg: typeof rec.colors?.bg === "string" ? rec.colors.bg : null,
      ink: typeof rec.colors?.ink === "string" ? rec.colors.ink : null,
      accent: typeof rec.colors?.accent === "string" ? rec.colors.accent : null
    },
    typography: {
      display: typeof rec.typography?.display === "string" ? rec.typography.display : null,
      body: typeof rec.typography?.body === "string" ? rec.typography.body : null
    },
    radius_px: typeof rec.radius_px === "number" && Number.isFinite(rec.radius_px) ? rec.radius_px : null,
    cta_chrome: chrome === "fill" || chrome === "outline" || chrome === "ghost" ? chrome : null,
    density: density === "tight" || density === "airy" || density === "uneven" ? density : null,
    avoid: Array.isArray(rec.avoid)
      ? rec.avoid.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      : [...GENERIC_AI_AVOID]
  };
}

export function lookContractHasMeasuredTokens(contract: LookContract): boolean {
  return Boolean(contract.colors.bg || contract.colors.ink || contract.colors.accent || contract.typography.display);
}

export function resolveLookContract(input: {
  look_contract?: LookContract | null;
  tokens?: DesignTokensDocument | null;
  compact_tokens?: CompactLookTokens | null;
  spacing_feel?: string | null;
  layout?: string | null;
  style?: string | null;
}): LookContract {
  if (input.look_contract) return input.look_contract;
  return buildLookContract({
    tokens: input.tokens ?? null,
    compact_tokens: input.compact_tokens ?? null,
    spacing_feel: input.spacing_feel ?? null,
    layout: input.layout ?? null,
    style: input.style ?? null
  });
}

export type LookTokenHints = {
  colors: Record<string, string>;
  typography: Record<string, string>;
  shape: Record<string, string>;
};

/** Map look_contract into DIG-008 token_hints slots (bg→background, ink→foreground). */
export function tokenHintsFromLookContract(contract: LookContract): LookTokenHints {
  const colors: Record<string, string> = {};
  if (contract.colors.bg) colors.background = contract.colors.bg;
  if (contract.colors.ink) colors.foreground = contract.colors.ink;
  if (contract.colors.accent) colors.accent = contract.colors.accent;
  const typography: Record<string, string> = {};
  if (contract.typography.display) typography.heading = contract.typography.display;
  if (contract.typography.body) typography.body = contract.typography.body;
  const shape: Record<string, string> = {};
  if (contract.radius_px != null) shape.radius = `${contract.radius_px}px`;
  if (contract.cta_chrome) shape.cta_chrome = contract.cta_chrome;
  if (contract.density) shape.density = contract.density;
  return { colors, typography, shape };
}

export function lookContractGenerateConstraints(contract: LookContract): string[] {
  const out = [...lookContractRules(contract)];
  if (contract.density) {
    out.push(`Spacing density is ${contract.density}; do not even out into generic card padding.`);
  }
  for (const item of contract.avoid) {
    out.push(`avoid:${item}`);
  }
  return out;
}

export function lookContractRules(contract: LookContract): string[] {
  const rules = [
    "Obey look_contract.avoid — these tropes are forbidden (no glassmorphism, no generic AI gradients).",
    "Do not invent a new palette, type pairing, or corner radius when look_contract has measured values."
  ];
  if (contract.colors.bg || contract.colors.ink || contract.colors.accent) {
    const bits = [
      contract.colors.bg ? `bg ${contract.colors.bg}` : null,
      contract.colors.ink ? `ink ${contract.colors.ink}` : null,
      contract.colors.accent ? `accent ${contract.colors.accent}` : null
    ].filter(Boolean);
    rules.push(`Use measured colors only: ${bits.join(", ")}.`);
  }
  if (contract.typography.display || contract.typography.body) {
    rules.push(
      `Use measured type: ${[contract.typography.display, contract.typography.body].filter(Boolean).join(" · ")}.`
    );
  }
  if (contract.radius_px != null) {
    rules.push(`Corner radius ≈ ${contract.radius_px}px (from capture); do not default to 16px cards.`);
  }
  if (contract.cta_chrome) {
    rules.push(`Primary CTA chrome is ${contract.cta_chrome}; do not switch to a different button style.`);
  }
  return rules;
}
