'use client'

import { Chip, Lede, LedeStrip, Stack, SwatchStrip, Text } from '../lib/msqdx-ui'
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

const HERO_LIMIT = 4
const META_CHIP_LIMIT = 8

export function screenInsightLedes(
  facets: DesignFacets | null | undefined,
  pageArc: string | null | undefined,
  copy: typeof paths.libraryCopy = paths.libraryCopy,
): ScreenInsightLede[] {
  if (!facets) return []
  const rows: Array<{ id: string; label: string; value: string | null | undefined }> = [
    { id: 'page_type', label: copy.screenInsightPageType, value: facets.page_type },
    { id: 'style', label: copy.screenInsightStyle, value: facets.style },
    { id: 'layout', label: copy.screenInsightLayout, value: facets.layout },
    { id: 'color', label: copy.screenInsightColor, value: facets.color_mood },
  ]
  return rows.flatMap((row) => {
    const value = row.value?.trim()
    if (!value) return []
    return [{ id: row.id, label: row.label, value: humanizeFacet(value) }]
  }).slice(0, HERO_LIMIT)
}

export function screenInsightMetaChips(
  facets: DesignFacets | null | undefined,
  pageArc: string | null | undefined,
): string[] {
  if (!facets) return []
  const contract = facets.look_contract
  const secondary = [
    pageArc,
    facets.typography,
    contract?.cta_chrome,
    contract?.density,
    contract?.radius_px != null ? `${contract.radius_px}px` : null,
  ]
  const tags = [
    ...secondary,
    ...facets.industry_tags,
    ...facets.section_categories,
  ]
  const seen = new Set<string>()
  const chips: string[] = []
  for (const raw of tags) {
    const value = raw?.trim()
    if (!value) continue
    const label = humanizeFacet(value)
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    chips.push(label)
    if (chips.length >= META_CHIP_LIMIT) break
  }
  return chips
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
  const chips = screenInsightMetaChips(props.facets, props.pageArc)

  return (
    <section className="dig-screen-insight" aria-label={copy.screenInsightTitle}>
      <header className="dig-screen-insight-header">
        <Text role="display" as="h2">
          {props.title}
        </Text>
        {props.url ? <Text role="meta">{props.url}</Text> : null}
      </header>

      {props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightPending}</Text>
      ) : null}

      {!props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightEmpty}</Text>
      ) : null}

      {hasSignal && props.facets ? (
        <Stack gap="sm">
          {ledes.length ? (
            <LedeStrip
              className="dig-screen-insight-ledes"
              columns={Math.min(4, ledes.length)}
              compact
              aria-label={copy.screenInsightTitle}
            >
              {ledes.map((lede) => (
                <Lede key={lede.id} kind="text" value={lede.value} label={lede.label} />
              ))}
            </LedeStrip>
          ) : null}
          {contract || chips.length ? (
            <div className="dig-screen-insight-meta">
              {contract ? <LookSwatches contract={contract} /> : null}
              {chips.length ? (
                <ul className="dig-screen-insight-chips">
                  {chips.map((tag) => (
                    <li key={tag}>
                      <Chip static size="sm">
                        {tag}
                      </Chip>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
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
