import type { ReactNode } from 'react'
import {
  Chip,
  Grid,
  IconBadge,
  IconGap,
  IconImage,
  IconOpacity,
  IconScroll,
  IconSparkles,
  IconType,
  Panel,
  SectionChrome,
  Stack,
  Text,
} from '../lib/msqdx-ui'
import type { VisualCraft } from '../lib/dig-api'
import { paths } from '../lib/paths'

export type VisualCraftAtomId =
  | 'type_image'
  | 'type'
  | 'imagery'
  | 'space'
  | 'chrome'

export type VisualCraftAtom = {
  id: VisualCraftAtomId
  index: string
  label: string
  value: string
}

const ATOM_FIELDS: Array<{
  id: VisualCraftAtomId
  field: keyof VisualCraft
  labelKey:
    | 'screenInsightTypeImage'
    | 'screenInsightTypeCraft'
    | 'screenInsightImagery'
    | 'screenInsightSpace'
    | 'screenInsightChrome'
}> = [
  { id: 'type_image', field: 'type_image_relationship', labelKey: 'screenInsightTypeImage' },
  { id: 'type', field: 'typography_composition', labelKey: 'screenInsightTypeCraft' },
  { id: 'imagery', field: 'imagery_craft', labelKey: 'screenInsightImagery' },
  { id: 'space', field: 'spatial_craft', labelKey: 'screenInsightSpace' },
  { id: 'chrome', field: 'chrome_vs_content', labelKey: 'screenInsightChrome' },
]

const ATOM_ICONS: Record<VisualCraftAtomId, ReactNode> = {
  type_image: <IconOpacity />,
  type: <IconType />,
  imagery: <IconImage />,
  space: <IconGap />,
  chrome: <IconBadge />,
}

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

export function visualCraftAtoms(
  craft: VisualCraft | null | undefined,
  copy: typeof paths.libraryCopy = paths.libraryCopy,
): VisualCraftAtom[] {
  if (!craft) return []
  return ATOM_FIELDS.flatMap((def) => {
    const value = craft[def.field]?.trim()
    if (!value) return []
    return [{ id: def.id, index: '', label: copy[def.labelKey], value }]
  }).map((atom, index) => ({
    ...atom,
    index: String(index + 1).padStart(2, '0'),
  }))
}

export function visualCraftRebuildSpec(craft: VisualCraft | null | undefined): string | null {
  const value = craft?.rebuild_spec?.trim()
  return value || null
}

export function VisualCraftPanel({
  craft,
  embedded = false,
}: {
  craft: VisualCraft | null | undefined
  embedded?: boolean
}) {
  if (!visualCraftHasUiSignal(craft) || !craft) return null
  const copy = paths.libraryCopy
  const atoms = visualCraftAtoms(craft, copy)
  const rebuildSpec = visualCraftRebuildSpec(craft)

  return (
    <Panel
      as="section"
      variant={embedded ? 'flush' : 'editorial'}
      className="dig-visual-craft"
      aria-label={copy.screenInsightCraft}
    >
      <SectionChrome
        icon={<IconSparkles />}
        title={copy.screenInsightCraft}
        meta={copy.screenInsightCraftKicker}
        as="h2"
      />
      <Grid
        className="dig-visual-craft-grid"
        columns="repeat(auto-fit, minmax(16.5rem, 1fr))"
        gap="md"
      >
        {atoms.map((atom) => (
          <Panel
            key={atom.id}
            as="article"
            variant="card"
            className="dig-visual-craft-card"
            aria-labelledby={`dig-visual-craft-${atom.id}`}
          >
            <Stack gap="sm">
              <Stack direction="row" gap="sm" align="center" justify="space-between">
                <Chip static size="sm">
                  {atom.index}
                </Chip>
                <span className="dig-visual-craft-icon" aria-hidden>
                  {ATOM_ICONS[atom.id]}
                </span>
              </Stack>
              <Text role="label" id={`dig-visual-craft-${atom.id}`}>
                {atom.label}
              </Text>
              <Text role="body">{atom.value}</Text>
            </Stack>
          </Panel>
        ))}
        {rebuildSpec ? (
          <Panel
            as="article"
            variant="card"
            className="dig-visual-craft-card dig-visual-craft-spec"
            aria-labelledby="dig-visual-craft-rebuild"
          >
            <Stack gap="sm">
              <Stack direction="row" gap="sm" align="center" justify="space-between">
                <Chip static size="sm">
                  {String(atoms.length + 1).padStart(2, '0')}
                </Chip>
                <span className="dig-visual-craft-icon" aria-hidden>
                  <IconScroll />
                </span>
              </Stack>
              <Text role="label" id="dig-visual-craft-rebuild">
                {copy.screenInsightRebuildSpec}
              </Text>
              <Text role="body">{rebuildSpec}</Text>
            </Stack>
          </Panel>
        ) : null}
      </Grid>
    </Panel>
  )
}
