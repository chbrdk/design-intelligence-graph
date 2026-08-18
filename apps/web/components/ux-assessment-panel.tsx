import { IconScroll } from '../lib/msqdx-ui'
import type { VisionPageSummary } from '../lib/dig-api'
import { paths } from '../lib/paths'
import { uxAssessmentAtoms } from '../lib/spec-atoms'
import { SpecAtomGrid } from './spec-atom-grid'

export function UxAssessmentPanel({
  page,
  summary,
}: {
  page: VisionPageSummary | null | undefined
  summary?: string | null
}) {
  const atoms = uxAssessmentAtoms(page, summary)
  if (!atoms.length) return null
  return (
    <SpecAtomGrid
      title={paths.libraryCopy.screenInsightUx}
      kicker={paths.libraryCopy.screenInsightUxKicker}
      atoms={atoms}
      headingId="dig-ux-assessment"
      icon={<IconScroll />}
    />
  )
}
