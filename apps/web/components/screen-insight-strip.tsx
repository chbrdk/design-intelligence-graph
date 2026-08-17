'use client'

import { Text } from '../lib/msqdx-ui'
import type { DesignFacets, LookContract } from '../lib/dig-api'
import { paths } from '../lib/paths'

function humanizeFacet(value: string): string {
  return value
    .replace(/[_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function Metric({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <div className="dig-screen-insight-metric">
      <dt>{label}</dt>
      <dd>{humanizeFacet(value)}</dd>
    </div>
  )
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <div className="dig-screen-insight-chips">
      <span className="dig-screen-insight-chips-label">{label}</span>
      <ul>
        {values.slice(0, 8).map((tag) => (
          <li key={tag}>{humanizeFacet(tag)}</li>
        ))}
      </ul>
    </div>
  )
}

function ColorSwatches({ contract }: { contract: LookContract }) {
  const items = [
    { key: 'bg', hex: contract.colors.bg },
    { key: 'ink', hex: contract.colors.ink },
    { key: 'accent', hex: contract.colors.accent },
  ].filter((item): item is { key: string; hex: string } => Boolean(item.hex))
  if (!items.length) return null
  return (
    <div className="dig-screen-insight-swatches" aria-label={paths.libraryCopy.screenInsightLook}>
      {items.map((item) => (
        <span key={item.key} className="dig-screen-insight-swatch">
          <i style={{ background: item.hex }} aria-hidden />
          <span>
            {item.key} {item.hex}
          </span>
        </span>
      ))}
    </div>
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
  pending?: boolean
  notes?: string | null
}) {
  const copy = paths.libraryCopy
  const hasSignal = designFacetsHaveUiSignal(props.facets)
  const contract = props.facets?.look_contract ?? null

  return (
    <section className="dig-screen-insight" aria-label={copy.screenInsightTitle}>
      <header className="dig-screen-insight-header">
        <Text role="headline">{props.title}</Text>
        {props.url ? <Text role="meta">{props.url}</Text> : null}
      </header>

      {props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightPending}</Text>
      ) : null}

      {!props.pending && !hasSignal ? (
        <Text role="hint">{copy.screenInsightEmpty}</Text>
      ) : null}

      {hasSignal && props.facets ? (
        <>
          <dl className="dig-screen-insight-grid">
            <Metric label={copy.screenInsightPageType} value={props.facets.page_type} />
            <Metric label={copy.screenInsightStyle} value={props.facets.style} />
            <Metric label={copy.screenInsightLayout} value={props.facets.layout} />
            <Metric label={copy.screenInsightColor} value={props.facets.color_mood} />
            <Metric label={copy.screenInsightTypography} value={props.facets.typography} />
            <Metric label={copy.screenInsightAboveFold} value={props.facets.above_fold_job} />
            <Metric
              label={copy.screenInsightCta}
              value={contract?.cta_chrome ? contract.cta_chrome : null}
            />
            <Metric
              label={copy.screenInsightDensity}
              value={contract?.density ? contract.density : null}
            />
            <Metric
              label={copy.screenInsightRadius}
              value={contract?.radius_px != null ? `${contract.radius_px}px` : null}
            />
          </dl>
          {contract ? <ColorSwatches contract={contract} /> : null}
          <ChipRow label={copy.screenInsightIndustry} values={props.facets.industry_tags} />
          <ChipRow label={copy.screenInsightSections} values={props.facets.section_categories} />
          <ChipRow label={copy.screenInsightAvoid} values={contract?.avoid ?? []} />
        </>
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
