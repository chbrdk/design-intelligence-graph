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
  const [clusterMode, setClusterMode] = useState<'clusters' | 'nodes'>('clusters')
  const [clusterBy, setClusterBy] = useState<'contrast' | 'style'>('contrast')
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'embeddings' | 'facets'>('embeddings')
  const [model, setModel] = useState('')
  const [nodes, setNodes] = useState<
    Array<{
      capture_run_id: string
      viewport_capture_id: string | null
      craft_label: string
      cluster_label: string
      contrast_label: string
    }>
  >([])
  const [edges, setEdges] = useState<Array<{ from_id: string; to_id: string; score: number }>>([])

  useEffect(() => {
    let cancelled = false
    setSelectedCluster(null)
    setClusterMode('clusters')
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
            contrast_label: node.contrast_label,
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
        contrast: node.contrast_label,
        href: node.viewport_capture_id ? libraryScreenHref(node.viewport_capture_id) : null,
      })),
    [nodes],
  )

  const clusterValueFor = (node: (typeof nodes)[number]) =>
    clusterBy === 'contrast' ? node.contrast_label || 'mixed' : node.cluster_label || 'mixed'

  const clusters = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const key = clusterValueFor(node)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))
  }, [nodes, clusterBy])

  const activeNodes = useMemo(() => {
    if (!selectedCluster) return viewNodes
    return viewNodes.filter((node) => {
      const meta = nodes.find((item) => item.capture_run_id === node.id)
      return meta ? clusterValueFor(meta) === selectedCluster : false
    })
  }, [nodes, viewNodes, selectedCluster, clusterBy])

  const activeNodeIds = useMemo(() => new Set(activeNodes.map((node) => node.id)), [activeNodes])

  const activeEdges = useMemo(() => {
    if (!selectedCluster) return edges
    return edges.filter((edge) => activeNodeIds.has(edge.from_id) && activeNodeIds.has(edge.to_id))
  }, [edges, activeNodeIds, selectedCluster])

  const selectedClusterCount = useMemo(
    () => clusters.find((cluster) => cluster.label === selectedCluster)?.count ?? 0,
    [clusters, selectedCluster],
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
      {!!clusters.length ? (
        <Text>
          Start in cluster overview, then click a cluster to drill into just that neighborhood. That keeps the
          embeddings useful because neighbors are only compared inside the chosen facet bucket.
        </Text>
      ) : null}
      {clusters.map((cluster) => (
        <Chip key={cluster.label}>
          <button
            type="button"
            onClick={() => {
              setSelectedCluster(cluster.label)
              setClusterMode('nodes')
            }}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            {cluster.label} · {cluster.count}
          </button>
        </Chip>
      ))}
      <ToggleGroup
        aria-label="Cluster by"
        value={clusterBy}
        onChange={(value) => {
          setClusterBy(value === 'style' ? 'style' : 'contrast')
          setSelectedCluster(null)
          setClusterMode('clusters')
        }}
        options={[
          { value: 'contrast', label: 'Contrast' },
          { value: 'style', label: 'Style' },
        ]}
      />
      <ToggleGroup
        aria-label="Graph view"
        value={clusterMode}
        onChange={(value) => setClusterMode(value === 'nodes' ? 'nodes' : 'clusters')}
        options={[
          { value: 'clusters', label: 'Overview' },
          { value: 'nodes', label: 'Drilldown' },
        ]}
      />
      {clusterMode === 'nodes' ? (
        <Text>
          {selectedCluster
            ? `Drilldown: ${selectedCluster} · ${selectedClusterCount} screens · ${activeEdges.length} internal links`
            : 'Pick a cluster chip or cluster node first to drill into a smaller neighborhood.'}
        </Text>
      ) : (
        <Text>Overview shows cluster-to-cluster relationships only.</Text>
      )}
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
          nodes={clusterMode === 'nodes' && selectedCluster ? activeNodes : viewNodes}
          edges={clusterMode === 'nodes' && selectedCluster ? activeEdges : edges}
          clusterMode={clusterMode}
          clusterBy={clusterBy}
          onClusterClick={(cluster) => {
            setSelectedCluster(cluster)
            setClusterMode('nodes')
          }}
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
