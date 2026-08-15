/** Bounds for capture payloads on large sites (e.g. apple.de). Paths: knowledge/paths.json → captureLimits */

export type MatchedStylesMode = "essential" | "compact" | "off";

export const CAPTURE_LIMITS = {
  maxHtmlBytes: 8_000_000,
  /** When true, stylesheet rules keep selector/declarations but omit full css_text. */
  omitStylesheetCssText: true,
  maxStylesheetRuleCssTextChars: 2_000,
  /** Default essential caps (compact mode may raise these via paths.json overrides). */
  maxMatchedStyleNodes: 200,
  maxMatchedRulesPerNode: 8,
  maxInheritedEntriesPerNode: 4,
  matchedStylesMode: "essential" as MatchedStylesMode,
  /** Caps used when matchedStylesMode is compact (legacy). */
  compactMaxMatchedStyleNodes: 800,
  compactMaxMatchedRulesPerNode: 30,
  compactMaxInheritedEntriesPerNode: 12
} as const;

export function matchedStylesMode(): MatchedStylesMode {
  const mode = CAPTURE_LIMITS.matchedStylesMode;
  if (mode === "compact" || mode === "off" || mode === "essential") return mode;
  return "essential";
}

export function matchedStyleNodeCap(): number {
  return matchedStylesMode() === "compact"
    ? CAPTURE_LIMITS.compactMaxMatchedStyleNodes
    : CAPTURE_LIMITS.maxMatchedStyleNodes;
}

export function matchedRulesPerNodeCap(): number {
  return matchedStylesMode() === "compact"
    ? CAPTURE_LIMITS.compactMaxMatchedRulesPerNode
    : CAPTURE_LIMITS.maxMatchedRulesPerNode;
}

export function inheritedEntriesPerNodeCap(): number {
  return matchedStylesMode() === "compact"
    ? CAPTURE_LIMITS.compactMaxInheritedEntriesPerNode
    : CAPTURE_LIMITS.maxInheritedEntriesPerNode;
}

export function boundUtf8Text(
  value: string,
  maxBytes: number,
  marker: string
): { value: string; truncated: boolean } {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return { value, truncated: false };
  let end = Math.min(value.length, maxBytes);
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end -= 1;
  return {
    value: `${value.slice(0, end)}\n<!-- dig:truncated ${marker} original_bytes=${bytes} -->\n`,
    truncated: true
  };
}
