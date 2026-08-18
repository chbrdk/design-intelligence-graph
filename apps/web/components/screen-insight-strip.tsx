'use client'

import {
  Chip,
  IconGrid,
  Lede,
  LedeStrip,
  SectionChrome,
  Stack,
  SwatchStrip,
  Text,
} from '../lib/msqdx-ui'
import type { DesignFacets, LookContract } from '../lib/dig-api'
import { paths } from '../lib/paths'

export function humanizeFacet(value: string): string {
  return value
    .replace(/[_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ScreenInsightLede = {
  id: string
  label: string
  value: string
}

export function screenInsightLedes(
  facets: DesignFacets | null | undefined,
  pageArc: string | null | undefined,
  copy: typeof paths.libraryCopy = paths.libraryCopy,
): ScreenInsightLede[] {
  if (!facets) return []
  const contract = facets.look_contract
  const rows: Array<{ id: string; label: string; value: string | null | undefined }> = [
    { id: 'page_type', label: copy.screenInsightPageType, value: facets.page_type },
    { id: 'style', label: copy.screenInsightStyle, value: facets.style },
    { id: 'layout', label: copy.screenInsightLayout, value: facets.layout },
    { id: 'page_arc', label: copy.screenInsightPageArc, value: pageArc },
    { id: 'color', label: copy.screenInsightColor, value: facets.color_mood },
    { id: 'typography', label: copy.screenInsightTypography, value: facets.typography },
    { id: 'above_fold', label: copy.screenInsightAboveFold, value: facets.above_fold_job },
    { id: 'cta', label: copy.screenInsightCta, value: contract?.cta_chrome },
    { id: 'density', label: copy.screenInsightDensity, value: contract?.density },
    {
      id: 'radius',
      label: copy.screenInsightRadius,
      value: contract?.radius_px != null ? `${contract.radius_px}px` : null,
    },
  ]
  return rows.flatMap((row) => {
    const value = row.value?.trim()
    if (!value) return []
    return [{ id: row.id, label: row.label, value: humanizeFacet(value) }]
  })
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <div className="dig-screen-insight-chips">
      <span className="dig-screen-insight-chips-label">{label}</span>
      <ul>
        {values.slice(0, 8).map((tag) => (
          <li key={tag}>
            <Chip static size="sm">
              {humanizeFacet(tag)}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LookSwatches({ contract }: { contract: LookContract }) {
  const hexes = [contract.colors.bg, contract.colors.ink, contract.colors.accent].filter(
    (hex): hex is string => Boolean(hex),
  )
  if (!hexes.length) return null
  return (
    <SwatchStrip
      className="dig-screen-insight-swatches"
      swatches={hexes}
      max={3}
      label={hexes.join(' · ')}
      aria-label={paths.libraryCopy.screenInsightLook}
    />
  )
}

export function lookContractHasUiSignal(contract: LookContract | null | undefined): boolean {
  if (!contract) return false
  return Boolean(
    contract.colors.bg ||
      contract.colors.ink ||
      contract.colors.accent ||
      contract.typography.display ||
      contract.typography.body ||
      contract.radius_px != null ||
      contract.cta_chrome ||
      contract.density,
  )
}

export function designFacetsHaveUiSignal(facets: DesignFacets | null | undefined): boolean {
  if (!facets) return false
  return Boolean(
    facets.page_type ||
      facets.style ||
      facets.layout ||
      facets.color_mood ||
      facets.typography ||
      facets.above_fold_job ||
      facets.industry_tags.length ||
      facets.section_categories.length ||
      lookContractHasUiSignal(facets.look_contract),
  )
}

export function ScreenInsightStrip(props: {
  title: string
  url?: string | null
  facets: DesignFacets | null | undefined
  pageArc?: string | null
  pending?: boolean
  notes?: string | null
}) {
  const copy = paths.libraryCopy
  const hasSignal = designFacetsHaveUiSignal(props.facets) || Boolean(props.pageArc?.trim())
  const contract = props.facets?.look_contract ?? null
  const ledes = screenInsightLedes(props.facets, props.pageArc, copy)

  return (
    <section className="dig-screen-insight" aria-label={copy.screenInsightTitle}>
      <header className="dig-screen-insight-header">
        <Text role="headline">{props.title}</Text>
        {props.url ? <Text role="meta">{props.url}</Text> : null}
      </header>

      <SectionChrome
        icon={<IconGrid />}
        title={copy.screenInsightTitle}
        meta={copy.screenInsightKicker}
        as="h2"
      />

      {props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightPending}</Text>
      ) : null}

      {!props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightEmpty}</Text>
      ) : null}

      {hasSignal && props.facets ? (
        <Stack gap="md">
          {ledes.length ? (
            <LedeStrip
              className="dig-screen-insight-ledes"
              columns={4}
              compact
              aria-label={copy.screenInsightTitle}
            >
              {ledes.map((lede) => (
                <Lede key={lede.id} kind="text" value={lede.value} label={lede.label} />
              ))}
            </LedeStrip>
          ) : null}
          {contract ? <LookSwatches contract={contract} /> : null}
          <ChipRow label={copy.screenInsightIndustry} values={props.facets.industry_tags} />
          <ChipRow label={copy.screenInsightSections} values={props.facets.section_categories} />
          <ChipRow label={copy.screenInsightAvoid} values={contract?.avoid ?? []} />
        </Stack>
      ) : null}

      {props.notes?.trim() ? (
        <details className="dig-screen-insight-more">
          <summary>{copy.screenInsightMore}</summary>
          <Text role="meta">{props.notes}</Text>
        </details>
      ) : null}
    </section>
  )
}
