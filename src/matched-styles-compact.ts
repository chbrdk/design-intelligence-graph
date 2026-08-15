import { STYLE_PROPERTIES } from "./config.js";
import { CAPTURE_LIMITS, matchedStylesMode } from "./capture-limits.js";

type JsonRecord = Record<string, unknown>;

const ESSENTIAL_PROP_SET = new Set<string>(STYLE_PROPERTIES);

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function compactStyle(style: unknown): unknown {
  const record = asRecord(style);
  if (!record) return style;
  const cssProperties = asRecord(record.cssProperties);
  const shorthands = Array.isArray(record.shorthandEntries) ? record.shorthandEntries.slice(0, 40) : [];
  return {
    ...(typeof record.styleSheetId === "string" ? { styleSheetId: record.styleSheetId } : {}),
    ...(typeof record.origin === "string" ? { origin: record.origin } : {}),
    cssProperties: Array.isArray(record.cssProperties)
      ? record.cssProperties.slice(0, 80)
      : cssProperties,
    shorthandEntries: shorthands
  };
}

function compactRuleMatch(match: unknown): unknown {
  const record = asRecord(match);
  if (!record) return match;
  const rule = asRecord(record.rule);
  return {
    matchingSelectors: Array.isArray(record.matchingSelectors) ? record.matchingSelectors.slice(0, 20) : [],
    rule: rule
      ? {
          ...(typeof rule.selectorList === "object" ? { selectorList: rule.selectorList } : {}),
          ...(typeof rule.origin === "string" ? { origin: rule.origin } : {}),
          style: compactStyle(rule.style),
          ...(typeof rule.styleSheetId === "string" ? { styleSheetId: rule.styleSheetId } : {})
        }
      : undefined
  };
}

/** Shrink CDP matched-style payloads so large sites stay serializable (legacy compact mode). */
export function compactMatchedStyleEntry(entry: unknown): unknown {
  const record = asRecord(entry);
  if (!record) return entry;
  const matchedRules = Array.isArray(record.matched_rules)
    ? record.matched_rules.slice(0, CAPTURE_LIMITS.compactMaxMatchedRulesPerNode).map(compactRuleMatch)
    : [];
  const inherited = Array.isArray(record.inherited)
    ? record.inherited.slice(0, CAPTURE_LIMITS.compactMaxInheritedEntriesPerNode).map((item) => {
        const inheritedRecord = asRecord(item);
        if (!inheritedRecord) return item;
        return {
          inlineStyle: compactStyle(inheritedRecord.inlineStyle),
          matchedCSSRules: Array.isArray(inheritedRecord.matchedCSSRules)
            ? inheritedRecord.matchedCSSRules.slice(0, 12).map(compactRuleMatch)
            : []
        };
      })
    : [];
  return {
    node_id: record.node_id,
    matched_rules: matchedRules,
    inherited,
    pseudo_elements: Array.isArray(record.pseudo_elements)
      ? record.pseudo_elements.slice(0, 8).map((item) => {
          const pseudo = asRecord(item);
          if (!pseudo) return item;
          return {
            pseudoType: pseudo.pseudoType,
            matches: Array.isArray(pseudo.matches) ? pseudo.matches.slice(0, 8).map(compactRuleMatch) : []
          };
        })
      : [],
    provenance: record.provenance
  };
}

function collectEssentialProps(style: unknown, into: Record<string, string>): void {
  const record = asRecord(style);
  if (!record) return;
  const props = Array.isArray(record.cssProperties) ? record.cssProperties : [];
  for (const prop of props) {
    const item = asRecord(prop);
    if (!item) continue;
    const name = typeof item.name === "string" ? item.name : null;
    const value = typeof item.value === "string" ? item.value : null;
    if (!name || value == null || !ESSENTIAL_PROP_SET.has(name)) continue;
    if (!(name in into)) into[name] = value;
  }
  const shorthands = Array.isArray(record.shorthandEntries) ? record.shorthandEntries : [];
  for (const short of shorthands) {
    const item = asRecord(short);
    if (!item) continue;
    const name = typeof item.name === "string" ? item.name : null;
    const value = typeof item.value === "string" ? item.value : null;
    if (!name || value == null || !ESSENTIAL_PROP_SET.has(name)) continue;
    if (!(name in into)) into[name] = value;
  }
}

/**
 * Flatten CDP matched styles to allowlisted design props only (default mode).
 * Drops inherited/pseudo dumps that dominate package size on large sites.
 */
export function toEssentialMatchedStyleEntry(entry: unknown): {
  node_id: unknown;
  props: Record<string, string>;
  selectors: string[];
  provenance?: unknown;
} {
  const record = asRecord(entry);
  if (!record) {
    return { node_id: null, props: {}, selectors: [] };
  }
  const props: Record<string, string> = {};
  const selectors: string[] = [];
  const matchedRules = Array.isArray(record.matched_rules)
    ? record.matched_rules.slice(0, CAPTURE_LIMITS.maxMatchedRulesPerNode)
    : [];
  for (const match of matchedRules) {
    const matchRecord = asRecord(match);
    if (!matchRecord) continue;
    if (Array.isArray(matchRecord.matchingSelectors)) {
      for (const selector of matchRecord.matchingSelectors.slice(0, 4)) {
        if (typeof selector === "string" && selectors.length < 8) selectors.push(selector);
      }
    }
    const rule = asRecord(matchRecord.rule);
    if (rule) collectEssentialProps(rule.style, props);
  }
  return {
    node_id: record.node_id,
    props,
    selectors,
    ...(record.provenance ? { provenance: record.provenance } : {})
  };
}

/** Normalize a raw CDP matched entry according to captureLimits.matchedStylesMode. */
export function normalizeMatchedStyleEntry(entry: unknown): unknown | null {
  const mode = matchedStylesMode();
  if (mode === "off") return null;
  if (mode === "compact") return compactMatchedStyleEntry(entry);
  return toEssentialMatchedStyleEntry(entry);
}

export function essentialPropAllowlistSize(): number {
  return ESSENTIAL_PROP_SET.size;
}
