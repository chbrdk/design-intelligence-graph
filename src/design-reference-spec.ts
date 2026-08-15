/**
 * Spec-era helpers for DIG-012 prompt/embedding/mapping contracts.
 * Not a provider caller and not DIG-008 generation.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface DesignReferenceLike {
  reference_id: string;
  taxonomy?: { category?: string };
  composition?: {
    signature?: string;
    roles?: string[];
    stack_summary?: string;
  };
  look?: {
    look_summary?: string;
    overlay?: { kind?: string } | undefined;
    alignment?: { text?: string; cta?: string } | undefined;
  };
  tokens?: { style_labels?: string[] };
}

export function buildEmbeddingCanonical(ref: DesignReferenceLike): string {
  const category = ref.taxonomy?.category ?? "unknown";
  const signature = ref.composition?.signature ?? "";
  const roles = (ref.composition?.roles ?? []).join(" ");
  let look = ref.look?.look_summary ?? "";
  const style = (ref.tokens?.style_labels ?? []).join(" ");
  const overlay = ref.look?.overlay?.kind ?? "none";
  const alignText = ref.look?.alignment?.text ?? "na";
  const alignCta = ref.look?.alignment?.cta ?? "na";
  let text = [
    `category:${category}`,
    `signature:${signature}`,
    `roles:${roles}`,
    `look:${look}`,
    `style:${style}`,
    `overlay:${overlay}`,
    `align_text:${alignText}`,
    `align_cta:${alignCta}`
  ].join("\n");
  if (text.length > 1500) {
    const overflow = text.length - 1500;
    look = look.slice(0, Math.max(0, look.length - overflow));
    text = [
      `category:${category}`,
      `signature:${signature}`,
      `roles:${roles}`,
      `look:${look}`,
      `style:${style}`,
      `overlay:${overlay}`,
      `align_text:${alignText}`,
      `align_cta:${alignCta}`
    ].join("\n");
  }
  return text;
}

export function loadLookConditionedMapping(root = ROOT): {
  role_to_taxonomy: Record<string, string>;
  look_to_constraints: Array<{
    when: { path: string; in?: string[]; eq?: string; includes?: string };
    constraint: string;
  }>;
} {
  const paths = JSON.parse(readFileSync(resolve(root, "knowledge/paths.json"), "utf8")) as {
    taxonomy?: { lookConditionedMapping?: string };
  };
  const relative =
    paths.taxonomy?.lookConditionedMapping ??
    "fixtures/design-references/look-conditioned-mapping.json";
  return JSON.parse(readFileSync(resolve(root, relative), "utf8")) as ReturnType<
    typeof loadLookConditionedMapping
  >;
}

export function rolesFromSignature(signature: string): string[] {
  return signature
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mapSignatureToTaxonomies(signature: string, root = ROOT): string[] {
  const mapping = loadLookConditionedMapping(root);
  return rolesFromSignature(signature).map(
    (role) => mapping.role_to_taxonomy[role] ?? `dig:element.container`
  );
}

function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function constraintsFromLook(
  reference: DesignReferenceLike,
  root = ROOT
): string[] {
  const mapping = loadLookConditionedMapping(root);
  const out: string[] = [];
  for (const rule of mapping.look_to_constraints) {
    const value = readPath(reference, rule.when.path);
    if (rule.when.in && typeof value === "string" && rule.when.in.includes(value)) {
      out.push(rule.constraint);
    } else if (rule.when.eq !== undefined && value === rule.when.eq) {
      out.push(rule.constraint);
    } else if (rule.when.includes && Array.isArray(value) && value.includes(rule.when.includes)) {
      out.push(rule.constraint);
    }
  }
  return [...new Set(out)];
}

export const PROMPT_HARD_RULE_MARKERS = [
  "Do not copy source marketing",
  "Do not invent measured geometry",
  "Prefer primary reference",
  "Cite reference_ids"
];
