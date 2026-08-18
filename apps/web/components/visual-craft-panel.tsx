import { IconSparkles } from '../lib/msqdx-ui'
import type { VisualCraft } from '../lib/dig-api'
import { paths } from '../lib/paths'
import { visualCraftAtoms, visualCraftRebuildSpec } from '../lib/spec-atoms'
import { SpecAtomGrid } from './spec-atom-grid'

export { visualCraftAtoms, visualCraftRebuildSpec } from '../lib/spec-atoms'

export function visualCraftHasUiSignal(craft: VisualCraft | null | undefined): boolean {
  return visualCraftAtoms(craft).length > 0 || Boolean(visualCraftRebuildSpec(craft))
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
  const rebuild = visualCraftRebuildSpec(craft)
  const atoms = visualCraftAtoms(craft, copy)
  const withRebuild = rebuild
    ? [
        ...atoms,
        {
          id: 'rebuild' as const,
          index: String(atoms.length + 1).padStart(2, '0'),
          label: copy.screenInsightRebuildSpec,
          value: rebuild,
          spanning: true,
        },
      ]
    : atoms

  return (
    <div className={embedded ? undefined : 'dig-visual-craft-standalone'}>
      <SpecAtomGrid
        title={copy.screenInsightCraft}
        kicker={copy.screenInsightCraftKicker}
        atoms={withRebuild}
        headingId="dig-visual-craft"
        icon={<IconSparkles />}
      />
    </div>
  )
}
