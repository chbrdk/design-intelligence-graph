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
import type { SpecAtom, SpecAtomId } from '../lib/spec-atoms'

const ATOM_ICONS: Record<SpecAtomId, ReactNode> = {
  type_image: <IconOpacity />,
  type: <IconType />,
  imagery: <IconImage />,
  space: <IconGap />,
  chrome: <IconBadge />,
  ux_job: <IconSparkles />,
  ux_flow: <IconScroll />,
  ux_strengths: <IconSparkles />,
  ux_risks: <IconBadge />,
  functionality: <IconBadge />,
  rebuild: <IconScroll />,
}

export function SpecAtomGrid({
  title,
  kicker,
  atoms,
  headingId,
  icon,
  lead,
  id,
  embedded = false,
}: {
  title: string
  kicker?: string
  atoms: SpecAtom[]
  headingId?: string
  icon?: ReactNode
  lead?: ReactNode
  id?: string
  embedded?: boolean
}) {
  if (!atoms.length) return null
  const grid = (
    <>
      {lead}
      <Grid
        className="dig-visual-craft-grid"
        columns="repeat(auto-fit, minmax(16.5rem, 1fr))"
        gap="md"
      >
        {atoms.map((atom) => (
          <Panel
            key={`${atom.id}-${atom.index}`}
            as="article"
            variant="card"
            className={`dig-visual-craft-card${atom.spanning ? ' dig-visual-craft-spec' : ''}`}
            aria-labelledby={headingId ? `${headingId}-${atom.id}-${atom.index}` : undefined}
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
              <Text
                role="label"
                id={headingId ? `${headingId}-${atom.id}-${atom.index}` : undefined}
              >
                {atom.label}
              </Text>
              <Text role="body" size="md">
                {atom.value}
              </Text>
            </Stack>
          </Panel>
        ))}
      </Grid>
    </>
  )
  if (embedded) return <div className="dig-visual-craft dig-visual-craft--embedded">{grid}</div>
  return (
    <Panel as="section" variant="flush" className="dig-visual-craft" aria-label={title} id={id}>
      <SectionChrome icon={icon ?? <IconSparkles />} title={title} meta={kicker} as="h2" />
      {grid}
    </Panel>
  )
}
