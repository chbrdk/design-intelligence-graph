export interface MotionEvidenceRecord {
  source?: string;
  animated_properties?: string[];
  compositor_friendly?: boolean;
  animation?: unknown;
  transition?: unknown;
}

export function isCompositorFriendly(properties: string[]): boolean {
  return properties.length > 0 && properties.every((property) => property === "transform" || property === "opacity");
}

export function summarizeMotion(records: MotionEvidenceRecord[]): {
  total: number;
  declarations: number;
  runtime_instances: number;
  by_source: Record<string, number>;
  compositor_friendly_runtime_instances: number;
  animated_properties: string[];
} {
  const bySource: Record<string, number> = {};
  const properties = new Set<string>();
  let declarations = 0;
  let compositorFriendly = 0;
  for (const record of records) {
    const source = record.source ?? "unknown";
    bySource[source] = (bySource[source] ?? 0) + 1;
    if (source === "computed_css") declarations++;
    for (const property of record.animated_properties ?? []) properties.add(property);
    if (source !== "computed_css" && record.compositor_friendly) compositorFriendly++;
  }
  return {
    total: records.length,
    declarations,
    runtime_instances: records.length - declarations,
    by_source: bySource,
    compositor_friendly_runtime_instances: compositorFriendly,
    animated_properties: [...properties].sort()
  };
}
