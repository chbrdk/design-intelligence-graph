import { Text } from '../lib/msqdx-ui'
import type { VisualCraft } from '../lib/dig-api'
import { paths } from '../lib/paths'

export function visualCraftHasUiSignal(craft: VisualCraft | null | undefined): boolean {
  if (!craft) return false
  return Boolean(
    craft.rebuild_spec?.trim() ||
      craft.type_image_relationship?.trim() ||
      craft.typography_composition?.trim() ||
      craft.imagery_craft?.trim() ||
      craft.spatial_craft?.trim() ||
      craft.chrome_vs_content?.trim(),
  )
}

function CraftBlock({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <div className="dig-visual-craft-block">
      <Text role="meta">{label}</Text>
      <Text role="body">{value.trim()}</Text>
    </div>
  )
}

export function VisualCraftPanel({ craft }: { craft: VisualCraft | null | undefined }) {
  if (!visualCraftHasUiSignal(craft) || !craft) return null
  const copy = paths.libraryCopy
  return (
    <section className="dig-visual-craft" aria-label={copy.screenInsightCraft}>
      <Text role="title">{copy.screenInsightCraft}</Text>
      <CraftBlock label={copy.screenInsightTypeImage} value={craft.type_image_relationship} />
      <CraftBlock label={copy.screenInsightTypeCraft} value={craft.typography_composition} />
      <CraftBlock label={copy.screenInsightImagery} value={craft.imagery_craft} />
      <CraftBlock label={copy.screenInsightSpace} value={craft.spatial_craft} />
      <CraftBlock label={copy.screenInsightChrome} value={craft.chrome_vs_content} />
      <CraftBlock label={copy.screenInsightRebuildSpec} value={craft.rebuild_spec} />
    </section>
  )
}
