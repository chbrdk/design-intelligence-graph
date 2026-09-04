/**
 * Canonical text for Stage B dense embeddings.
 * @see knowledge/dense-embeddings.md
 */

const MAX_CHARS = 1500;

export type ScreenEmbeddingInput = {
  industry?: string | null;
  style?: string | null;
  layout?: string | null;
  craft_tags?: string[] | null;
  imagery_density?: string | null;
  type_scale?: string | null;
  type_image_mode?: string | null;
  contrast_mode?: string | null;
  composition_energy?: string | null;
  chrome_weight?: string | null;
  value_key?: string | null;
  palette?: string | null;
  screen_patterns?: string[] | null;
  look_summary?: string | null;
  design_summary?: string | null;
  rhythm_summary?: string | null;
  module_signatures?: string[] | null;
};

export type ModuleEmbeddingInput = {
  category: string;
  signature?: string | null;
  craft_tags?: string[] | null;
  imagery_density?: string | null;
  type_scale?: string | null;
  type_image_mode?: string | null;
  contrast_mode?: string | null;
  look_summary?: string | null;
};

function token(value: string | null | undefined): string {
  return scrub(value ?? "").toLocaleLowerCase();
}

function scrub(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/\bcap_[a-f0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tags(values: string[] | null | undefined): string {
  return (values ?? [])
    .map((item) => token(item))
    .filter(Boolean)
    .join(" ");
}

function joinLines(lines: string[]): string {
  return lines.join("\n");
}

function truncateLook(lines: (look: string) => string[], look: string): string {
  let clipped = look;
  let text = joinLines(lines(clipped));
  if (text.length <= MAX_CHARS) return text;
  const overflow = text.length - MAX_CHARS;
  clipped = clipped.slice(0, Math.max(0, clipped.length - overflow));
  return joinLines(lines(clipped)).slice(0, MAX_CHARS);
}

/** Screen card for dense retrieval. No URL, brand, or capture id. */
export function buildScreenEmbeddingCanonical(input: ScreenEmbeddingInput): string {
  const look = token(input.look_summary) || token(input.design_summary);
  return truncateLook(
    (lookText) => [
      "kind:screen",
      `industry:${token(input.industry)}`,
      `style:${token(input.style)}`,
      `layout:${token(input.layout)}`,
      `craft:${tags(input.craft_tags)}`,
      `imagery:${token(input.imagery_density)}`,
      `type:${token(input.type_scale)} ${token(input.type_image_mode)}`.trim(),
      `contrast:${token(input.contrast_mode)}`,
      `value:${token(input.value_key)}`,
      `palette:${token(input.palette)}`,
      `pattern:${tags(input.screen_patterns)}`,
      `energy:${token(input.composition_energy)}`,
      `chrome:${token(input.chrome_weight)}`,
      `look:${lookText}`,
      `rhythm:${token(input.rhythm_summary)}`,
      `modules:${tags(input.module_signatures)}`
    ],
    look
  );
}

/** Module card (hero/nav/feature/…). Skip content/body dumps at the caller. */
export function buildModuleEmbeddingCanonical(input: ModuleEmbeddingInput): string {
  const look = token(input.look_summary);
  return truncateLook(
    (lookText) => [
      "kind:module",
      `category:${token(input.category)}`,
      `signature:${token(input.signature)}`,
      `craft:${tags(input.craft_tags)}`,
      `imagery:${token(input.imagery_density)}`,
      `type:${token(input.type_scale)} ${token(input.type_image_mode)}`.trim(),
      `contrast:${token(input.contrast_mode)}`,
      `look:${lookText}`
    ],
    look
  );
}

const BRANDISH = /\bhttps?:\/\/|cap_[a-f0-9]{8}|www\./i;

export function canonicalOmitsIdentity(text: string): boolean {
  return !BRANDISH.test(text);
}
