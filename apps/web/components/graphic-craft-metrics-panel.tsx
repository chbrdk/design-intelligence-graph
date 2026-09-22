'use client'

import { useMemo, useState } from 'react'
import {
  Accordion,
  Chip,
  IconSparkles,
  RadarChart,
  SectionChrome,
  Text,
} from '../lib/msqdx-ui'
import type { GraphicCraftMetricsSummary } from '../lib/dig-api'
import {
  formatGraphicCraftValue,
  graphicCraftAccordionRadarPoints,
  graphicCraftGroups,
  graphicCraftMetricRows,
  graphicCraftTopScores,
  type GraphicCraftMetricRow,
} from '../lib/graphic-craft-metrics-ui'
import { paths } from '../lib/paths'

function MetricRow({ row }: { row: GraphicCraftMetricRow }) {
  if (row.kind === 'score' && typeof row.value === 'number') {
    const pct = Math.max(0, Math.min(100, Math.round(row.value * 100)))
    return (
      <div className="dig-craft-metric" data-kind="score">
        <div className="dig-craft-metric-head">
          <span>{row.label}</span>
          <span className="dig-craft-metric-val">{pct}</span>
        </div>
        <div className="dig-craft-metric-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }
  if (row.kind === 'hex' && typeof row.value === 'string') {
    return (
      <div className="dig-craft-metric" data-kind="hex">
        <span>{row.label}</span>
        <span className="dig-craft-metric-swatch" style={{ background: row.value }} title={row.value} />
        <code>{row.value}</code>
      </div>
    )
  }
  return (
    <div className="dig-craft-metric" data-kind={row.kind}>
      <span>{row.label}</span>
      <Chip size="sm">{formatGraphicCraftValue(row)}</Chip>
    </div>
  )
}

function GroupPanel({
  rows,
  groupLabel,
}: {
  rows: GraphicCraftMetricRow[]
  groupLabel: string
}) {
  const copy = paths.libraryCopy
  const { points, truncated, scoreCount } = graphicCraftAccordionRadarPoints(rows)
  const radarData = points.map((p) => ({ label: p.label, value: p.value }))
  const nonScores = rows.filter((row) => row.kind !== 'score')
  const scoreRows = rows.filter((row) => row.kind === 'score')

  return (
    <div className="dig-craft-group-panel">
      {radarData.length >= 3 ? (
        <div className="dig-craft-metrics-radar">
          <RadarChart
            data={radarData}
            ariaLabel={`${groupLabel} ${copy.screenInsightCraftMetricsRadarAria}`}
            size={260}
          />
          {truncated ? (
            <Text role="meta">
              {copy.screenInsightCraftMetricsRadarTop
                .replace('{shown}', String(radarData.length))
                .replace('{total}', String(scoreCount))}
            </Text>
          ) : null}
        </div>
      ) : null}

      {nonScores.length > 0 ? (
        <div className="dig-craft-metric-list dig-craft-metric-list--meta">
          {nonScores.map((row) => (
            <MetricRow key={row.id} row={row} />
          ))}
        </div>
      ) : null}

      {scoreRows.length > 0 ? (
        <div className="dig-craft-metric-list">
          {scoreRows.map((row) => (
            <MetricRow key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function GraphicCraftMetricsPanel({
  doc,
}: {
  doc: GraphicCraftMetricsSummary | null | undefined
}) {
  const copy = paths.libraryCopy
  const rows = useMemo(() => graphicCraftMetricRows(doc), [doc])
  const groups = useMemo(() => graphicCraftGroups(rows), [rows])
  const topTone = useMemo(() => graphicCraftTopScores(rows, 'tone', 4), [rows])
  const topRisk = useMemo(() => graphicCraftTopScores(rows, 'risk', 4), [rows])
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  if (!doc || doc.status !== 'complete' || !rows.length) return null

  const filled = doc.filled_count ?? rows.length
  const total = doc.metric_count ?? rows.length
  const confidence =
    typeof doc.confidence === 'number' ? `${Math.round(doc.confidence * 100)}%` : null

  return (
    <section className="dig-craft-metrics" aria-labelledby="dig-craft-metrics-title">
      <SectionChrome
        title={copy.screenInsightCraftMetrics}
        meta={copy.screenInsightCraftMetricsKicker}
        as="h2"
        icon={<IconSparkles />}
      />
      <Text role="meta" id="dig-craft-metrics-title">
        {filled}/{total} {copy.screenInsightCraftMetricsFilled}
        {confidence ? ` · ${copy.screenInsightCraftMetricsConfidence} ${confidence}` : ''}
      </Text>

      {(topTone.length > 0 || topRisk.length > 0) && (
        <div className="dig-craft-metrics-highlights">
          {topTone.length ? (
            <div>
              <Text role="label">{copy.screenInsightCraftMetricsTone}</Text>
              <div className="dig-craft-metrics-chips">
                {topTone.map((row) => (
                  <Chip key={row.id} size="sm">
                    {row.label} {formatGraphicCraftValue(row)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {topRisk.length ? (
            <div>
              <Text role="label">{copy.screenInsightCraftMetricsRisks}</Text>
              <div className="dig-craft-metrics-chips">
                {topRisk.map((row) => (
                  <Chip key={row.id} size="sm">
                    {row.label} {formatGraphicCraftValue(row)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Accordion
        aria-label={copy.screenInsightCraftMetrics}
        value={openGroup}
        onChange={(id) => setOpenGroup(id)}
        items={groups.map((group) => ({
          id: group.group,
          title: `${group.label} (${group.rows.length})`,
          preview: group.rows
            .slice(0, 3)
            .map((row) => row.label)
            .join(' · '),
          panel: <GroupPanel rows={group.rows} groupLabel={group.label} />,
        }))}
      />
    </section>
  )
}
