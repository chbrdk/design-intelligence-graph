import { IconBadge } from '../lib/msqdx-ui'
import { paths } from '../lib/paths'
import { functionalityAtoms } from '../lib/spec-atoms'
import { SpecAtomGrid } from './spec-atom-grid'

export function FunctionalityPanel({
  ui,
  patterns,
  modules,
}: {
  ui?: string[]
  patterns?: string[]
  modules?: string[]
}) {
  const atoms = functionalityAtoms({ ui, patterns, modules })
  if (!atoms.length) return null
  return (
    <SpecAtomGrid
      title={paths.libraryCopy.screenInsightFunctionality}
      kicker={paths.libraryCopy.screenInsightFunctionalityKicker}
      atoms={atoms}
      headingId="dig-functionality"
      icon={<IconBadge />}
    />
  )
}
