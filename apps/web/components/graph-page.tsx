'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Chip, Panel, Text, ToggleGroup } from '../lib/msqdx-ui'
import { fetchSimilarityGraph } from '../lib/dig-api'
import { libraryScreenHref } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { SimilarityGraphView } from './similarity-graph-view'

type Kind = 'craft' | 'visual'

export function GraphPageClient() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('craft')
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'embeddings' | 'facets'>('embeddings')
  const [model, setModel] = useState('')
  const [nodes, setNodes] = useState<
    Array<{
      capture_run_id: string
      viewport_capture_id: string | null
      craft_label: string
      cluster_label: string
    }>
  >([])
  const [edges, setEdges] = useState<Array<{ from_id: string; to_id: string; score: number }>>([])

  useEffect(() => {
    let cancelled = false
    void fetchSimilarityGraph(kind)
      .then((graph) => {
        if (cancelled) return
        setError(null)
        setSource(graph.source)
        setModel(graph.model)
        setNodes(
          graph.nodes.map((node) => ({
            capture_run_id: node.capture_run_id,
            viewport_capture_id: node.viewport_capture_id,
            craft_label: node.craft_label,
            cluster_label: node.cluster_label,
          })),
        )
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

  const viewNodes = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.capture_run_id,
        label: node.craft_label,
        cluster: node.cluster_label,
        href: node.viewport_capture_id ? libraryScreenHref(node.viewport_capture_id) : null,
      })),
    [nodes],
  )

  const topClusters = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const key = node.cluster_label || 'mixed'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
  }, [nodes])

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
      {!!topClusters.length ? (
        <Text>
          Read the clusters like style neighborhoods: tight groups share more of the same visual signals.
          If you are looking for a modern design, start with nodes labeled `modern minimal`, then compare the
          nearby `editorial`, `type-led`, or `image-led` branches.
        </Text>
      ) : null}
      {topClusters.map(([label, count]) => (
        <Chip key={label}>
          {label} · {count}
        </Chip>
      ))}
      {source === 'facets' ? <Text>{paths.libraryCopy.graphFacets}</Text> : null}
      {error ? <Alert tone="info">{error}</Alert> : null}
      {!error && !edges.length ? (
        <Text>
          {kind === 'visual'
            ? paths.libraryCopy.graphEmptyVisual
            : paths.libraryCopy.graphEmptyCraft}
        </Text>
      ) : null}
      <Panel>
        <SimilarityGraphView
          ariaLabel={paths.libraryCopy.graphTitle}
          nodes={viewNodes}
          edges={edges}
          onNodeClick={(id) => {
            const meta = nodes.find((node) => node.capture_run_id === id)
            if (meta?.viewport_capture_id) {
              router.push(libraryScreenHref(meta.viewport_capture_id))
            }
          }}
        />
      </Panel>
    </AppShell>
  )
}
