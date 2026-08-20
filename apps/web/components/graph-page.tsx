'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Chip, Panel, Text, ToggleGroup } from '../lib/msqdx-ui'
import { fetchSimilarityGraph } from '../lib/dig-api'
import {
  communityTone,
  neighborsFor,
  nodeDegree,
  shortGraphLabel,
} from '../lib/graphify-communities'
import { libraryScreenHref } from '../lib/island-surfaces'
import { paths } from '../lib/paths'
import { AppShell } from './app-shell'
import { SimilarityGraphView } from './similarity-graph-view'

type Kind = 'craft' | 'visual'

type GraphNode = {
  capture_run_id: string
  viewport_capture_id: string | null
  site_domain: string | null
  title: string | null
  craft_label: string
  cluster_label: string
  contrast_label: string
}

export function GraphPageClient() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('craft')
  const [clusterBy, setClusterBy] = useState<'contrast' | 'style'>('contrast')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'embeddings' | 'facets'>('embeddings')
  const [model, setModel] = useState('')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<Array<{ from_id: string; to_id: string; score: number }>>([])

  useEffect(() => {
    let cancelled = false
    setSelectedId(null)
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
            site_domain: node.site_domain,
            title: node.title,
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

  const communityFor = (node: GraphNode) =>
    clusterBy === 'contrast' ? node.contrast_label || 'mixed' : node.cluster_label || 'mixed'

  const communities = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const key = communityFor(node)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }))
  }, [nodes, clusterBy])

  const communityOrder = useMemo(() => communities.map((c) => c.label), [communities])

  const viewNodes = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.capture_run_id,
        label: shortGraphLabel({
          domain: node.site_domain,
          title: node.title,
          craftLabel: node.craft_label,
        }),
        community: communityFor(node),
        domain: node.site_domain,
        title: node.title,
        craftLabel: node.craft_label,
        href: node.viewport_capture_id ? libraryScreenHref(node.viewport_capture_id) : null,
      })),
    [nodes, clusterBy],
  )

  const selected = useMemo(
    () => nodes.find((node) => node.capture_run_id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const selectedNeighbors = useMemo(() => {
    if (!selected) return []
    return neighborsFor(selected.capture_run_id, edges, 6).map((item) => {
      const meta = nodes.find((node) => node.capture_run_id === item.id)
      return {
        id: item.id,
        score: item.score,
        label: shortGraphLabel({
          domain: meta?.site_domain,
          title: meta?.title,
          craftLabel: meta?.craft_label,
        }),
        community: meta ? communityFor(meta) : 'mixed',
      }
    })
  }, [selected, edges, nodes, clusterBy])

  const selectedDegree = selected ? nodeDegree(selected.capture_run_id, edges) : 0

  return (
    <AppShell title={paths.libraryCopy.graphTitle} description={paths.libraryCopy.graphHint}>
      <div className="dig-graph-toolbar">
        <ToggleGroup
          aria-label={paths.libraryCopy.graphTitle}
          value={kind}
          onChange={(value) => setKind(value === 'visual' ? 'visual' : 'craft')}
          options={[
            { value: 'craft', label: paths.libraryCopy.graphCraft },
            { value: 'visual', label: paths.libraryCopy.graphVisual },
          ]}
        />
        <ToggleGroup
          aria-label={paths.libraryCopy.graphCommunityBy}
          value={clusterBy}
          onChange={(value) => {
            setClusterBy(value === 'style' ? 'style' : 'contrast')
            setSelectedId(null)
          }}
          options={[
            { value: 'contrast', label: paths.libraryCopy.graphByContrast },
            { value: 'style', label: paths.libraryCopy.graphByStyle },
          ]}
        />
        <Chip>
          {nodes.length} nodes · {edges.length} edges · {communities.length} communities
          {model ? ` · ${model}` : ''}
        </Chip>
      </div>

      <label className="dig-graph-search">
        <span className="dig-graph-search__label">{paths.libraryCopy.graphSearch}</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={paths.libraryCopy.graphSearchPlaceholder}
        />
      </label>

      <Text>{paths.libraryCopy.graphifyHint}</Text>
      {source === 'facets' ? <Text>{paths.libraryCopy.graphFacets}</Text> : null}
      {error ? <Alert tone="info">{error}</Alert> : null}
      {!error && !edges.length ? (
        <Text>
          {kind === 'visual'
            ? paths.libraryCopy.graphEmptyVisual
            : paths.libraryCopy.graphEmptyCraft}
        </Text>
      ) : null}

      <div className="dig-graph-shell">
        <aside className="dig-graph-legend" aria-label={paths.libraryCopy.graphLegend}>
          <Text>{paths.libraryCopy.graphLegend}</Text>
          {communities.map((community) => {
            const tone = communityTone(community.label, communityOrder)
            return (
              <button
                key={community.label}
                type="button"
                className="dig-graph-legend__row"
                onClick={() => setSearchQuery(community.label)}
              >
                <span className="dig-graph-legend__swatch" style={{ background: tone.fill }} />
                <span>
                  {community.label}
                  <span className="dig-graph-legend__count"> · {community.count}</span>
                </span>
              </button>
            )
          })}
        </aside>

        <Panel className="dig-graph-canvas">
          <SimilarityGraphView
            ariaLabel={paths.libraryCopy.graphTitle}
            nodes={viewNodes}
            edges={edges}
            selectedId={selectedId}
            searchQuery={searchQuery}
            onNodeSelect={(id) => setSelectedId(id)}
          />
        </Panel>

        <aside className="dig-graph-inspector" aria-label={paths.libraryCopy.graphInspector}>
          <Text>{paths.libraryCopy.graphInspector}</Text>
          {!selected ? (
            <Text>{paths.libraryCopy.graphInspectorEmpty}</Text>
          ) : (
            <>
              <h3 className="dig-graph-inspector__title">
                {shortGraphLabel({
                  domain: selected.site_domain,
                  title: selected.title,
                  craftLabel: selected.craft_label,
                })}
              </h3>
              <Chip>{communityFor(selected)}</Chip>
              <Chip>
                {paths.libraryCopy.graphDegree} {selectedDegree}
              </Chip>
              <Text>{selected.craft_label}</Text>
              {selected.title ? <Text>{selected.title}</Text> : null}
              <div className="dig-graph-inspector__neighbors">
                <Text>{paths.libraryCopy.graphNeighbors}</Text>
                {selectedNeighbors.length === 0 ? (
                  <Text>{paths.libraryCopy.graphNoNeighbors}</Text>
                ) : (
                  selectedNeighbors.map((neighbor) => (
                    <button
                      key={neighbor.id}
                      type="button"
                      className="dig-graph-inspector__neighbor"
                      onClick={() => setSelectedId(neighbor.id)}
                    >
                      <span>{neighbor.label}</span>
                      <span>{neighbor.score.toFixed(2)}</span>
                    </button>
                  ))
                )}
              </div>
              {selected.viewport_capture_id ? (
                <button
                  type="button"
                  className="dig-graph-inspector__open"
                  onClick={() => router.push(libraryScreenHref(selected.viewport_capture_id!))}
                >
                  {paths.libraryCopy.graphOpenLibrary}
                </button>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </AppShell>
  )
}
