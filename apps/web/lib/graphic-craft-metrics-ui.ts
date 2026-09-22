import type { GraphicCraftMetricValue, GraphicCraftMetricsSummary } from './dig-api'

export type GraphicCraftMetricRow = {
  id: string
  group: string
  label: string
  value: GraphicCraftMetricValue
  kind: 'score' | 'boolean' | 'hex' | 'text' | 'enum'
}

const GROUP_ORDER = [
  'format',
  'composition',
  'space',
  'type',
  'color',
  'image',
  'illustration',
  'brand',
  'tone',
  'material',
  'narrative',
  'risk',
  'production',
] as const

const GROUP_LABELS: Record<string, string> = {
  format: 'Format',
  composition: 'Composition',
  space: 'Space',
  type: 'Typography',
  color: 'Color',
  image: 'Imagery',
  illustration: 'Illustration',
  brand: 'Brand',
  tone: 'Tone',
  material: 'Material',
  narrative: 'Narrative',
  risk: 'Risks',
  production: 'Production',
}

export function graphicCraftGroupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group.replace(/_/g, ' ')
}

export function graphicCraftMetricLabel(id: string): string {
  const leaf = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id
  return leaf.replace(/_/g, ' ')
}

function classifyValue(value: GraphicCraftMetricValue): GraphicCraftMetricRow['kind'] {
  if (typeof value === 'number') return 'score'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return 'hex'
  if (typeof value === 'string' && value.includes(' ')) return 'text'
  if (typeof value === 'string') return 'enum'
  return 'text'
}

export function graphicCraftMetricRows(
  doc: GraphicCraftMetricsSummary | null | undefined,
): GraphicCraftMetricRow[] {
  const metrics = doc?.metrics
  if (!metrics) return []
  const rows: GraphicCraftMetricRow[] = []
  for (const [id, value] of Object.entries(metrics)) {
    if (value === null || value === undefined) continue
    const group = id.includes('.') ? id.slice(0, id.indexOf('.')) : 'other'
    rows.push({
      id,
      group,
      label: graphicCraftMetricLabel(id),
      value,
      kind: classifyValue(value),
    })
  }
  return rows.sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group as (typeof GROUP_ORDER)[number])
    const gb = GROUP_ORDER.indexOf(b.group as (typeof GROUP_ORDER)[number])
    const oa = ga < 0 ? 99 : ga
    const ob = gb < 0 ? 99 : gb
    if (oa !== ob) return oa - ob
    return a.id.localeCompare(b.id)
  })
}

export function graphicCraftGroups(
  rows: GraphicCraftMetricRow[],
): Array<{ group: string; label: string; rows: GraphicCraftMetricRow[] }> {
  const map = new Map<string, GraphicCraftMetricRow[]>()
  for (const row of rows) {
    const list = map.get(row.group) ?? []
    list.push(row)
    map.set(row.group, list)
  }
  const ordered: Array<{ group: string; label: string; rows: GraphicCraftMetricRow[] }> =
    GROUP_ORDER.filter((group) => map.has(group)).map((group) => ({
      group,
      label: graphicCraftGroupLabel(group),
      rows: map.get(group)!,
    }))
  for (const [group, groupRows] of map) {
    if ((GROUP_ORDER as readonly string[]).includes(group)) continue
    ordered.push({ group, label: graphicCraftGroupLabel(group), rows: groupRows })
  }
  return ordered
}

/** Highest scores in a group — useful for tone / risk highlights. */
export function graphicCraftTopScores(
  rows: GraphicCraftMetricRow[],
  group: string,
  limit = 5,
): GraphicCraftMetricRow[] {
  return rows
    .filter((row) => row.group === group && row.kind === 'score' && typeof row.value === 'number')
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, limit)
}

export function formatGraphicCraftValue(row: GraphicCraftMetricRow): string {
  if (row.kind === 'score' && typeof row.value === 'number') {
    return `${Math.round(row.value * 100)}`
  }
  if (typeof row.value === 'boolean') return row.value ? 'yes' : 'no'
  return String(row.value ?? '—')
}
