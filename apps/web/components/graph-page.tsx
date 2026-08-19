'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Chip, Panel, Text, ToggleGroup } from '../lib/msqdx-ui'
import { fetchSimilarityGraph } from '../lib/dig-api'
import { libraryScreenHref } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import { layoutSimilarityGraph } from '../lib/similarity-graph-layout'
import { AppShell } from './app-shell'

type Kind = 'craft' | 'visual'

export function GraphPageClient() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('craft')
  const [error, setError] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [nodes, setNodes] = useState<
    Array<{
      capture_run_id: string
      site_domain: string | null
      viewport_capture_id: string | null
      title: string | null
    }>
  >([])
  const [edges, setEdges] = useState<Array<{ from_id: string; to_id: string; score: number }>>([])

  useEffect(() => {
    let cancelled = false
    void fetchSimilarityGraph(kind)
      .then((graph) => {
        if (cancelled) return
        setError(null)
        setModel(graph.model)
        setNodes(graph.nodes)
        setEdges(graph.edges)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setNodes([])
        setEdges([])
        setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [kind])

  const layout = useMemo(
    () =>
      layoutSimilarityGraph(
        nodes.map((node) => ({
          id: node.capture_run_id,
          label: node.site_domain || node.title || node.capture_run_id.slice(0, 10),
        })),
        edges,
      ),
    [nodes, edges],
  )

  return (
    <AppShell title={paths.libraryCopy.graphTitle} description={paths.libraryCopy.graphHint}>
      <ToggleGroup
        aria-label={paths.libraryCopy.graphTitle}
        value={kind}
        onChange={(value) => setKind(value === 'visual' ? 'visual' : 'craft')}
        options={[
          { value: 'craft', label: paths.libraryCopy.graphCraft },
          { value: 'visual', label: paths.libraryCopy.graphVisual },
        ]}
      />
      <Chip>
        {nodes.length} nodes · {edges.length} edges
        {model ? ` · ${model}` : ''}
      </Chip>
      {error ? <Alert tone="info">{error}</Alert> : null}
      {!error && !edges.length ? <Text>{paths.libraryCopy.graphEmpty}</Text> : null}
      <Panel>
        <svg viewBox="0 0 960 560" role="img" aria-label={paths.libraryCopy.graphTitle} className="dig-graph">
          {layout.edges.map((edge) => {
            const from = layout.nodes.find((node) => node.id === edge.from_id)
            const to = layout.nodes.find((node) => node.id === edge.to_id)
            if (!from || !to) return null
            return (
              <line
                key={`${edge.from_id}-${edge.to_id}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                strokeOpacity={0.35 + edge.score * 0.4}
                strokeWidth={1 + edge.score}
              />
            )
          })}
          {layout.nodes.map((node) => {
            const meta = nodes.find((item) => item.capture_run_id === node.id)
            const href = meta?.viewport_capture_id ? libraryScreenHref(meta.viewport_capture_id) : null
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: href ? 'pointer' : 'default' }}
                onClick={() => {
                  if (href) router.push(href)
                }}
              >
                <circle r={7} fill="currentColor" />
                <text x={10} y={4} fontSize={11} fill="currentColor">
                  {node.label}
                </text>
              </g>
            )
          })}
        </svg>
      </Panel>
    </AppShell>
  )
}
