import type { MeasuredStyle } from "./responsive.js";

export interface NormalizedColorUsage {
  rgba: { r: number; g: number; b: number; a: number };
  hex: string;
  occurrences: number;
  properties: string[];
  node_ids: string[];
}

function parseRgb(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return null;
  const alphaRaw = match[4] ?? "1";
  const alpha = alphaRaw.endsWith("%") ? Number.parseFloat(alphaRaw) / 100 : Number.parseFloat(alphaRaw);
  return {
    r: Math.round(Number(match[1])), g: Math.round(Number(match[2])), b: Math.round(Number(match[3])),
    a: Number(Math.max(0, Math.min(1, alpha)).toFixed(4))
  };
}

const hex = (color: { r: number; g: number; b: number; a: number }): string =>
  `#${[color.r, color.g, color.b, Math.round(color.a * 255)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;

export function analyzeColorUsage(styles: MeasuredStyle[]): NormalizedColorUsage[] {
  const usage = new Map<string, { color: { r: number; g: number; b: number; a: number }; count: number; properties: Set<string>; nodes: Set<string> }>();
  for (const style of styles) {
    for (const [property, value] of Object.entries(style.properties ?? {})) {
      if (!/(color|fill|stroke)$/i.test(property)) continue;
      const color = parseRgb(value);
      if (!color) continue;
      const key = hex(color);
      const current = usage.get(key) ?? { color, count: 0, properties: new Set(), nodes: new Set() };
      current.count++;
      current.properties.add(property);
      current.nodes.add(style.node_id);
      usage.set(key, current);
    }
  }
  return [...usage.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).map(([key, value]) => ({
    rgba: value.color, hex: key, occurrences: value.count,
    properties: [...value.properties].sort(), node_ids: [...value.nodes].sort()
  }));
}
