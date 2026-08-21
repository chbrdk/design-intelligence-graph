'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Chip,
  Field,
  FilterRow,
  Input,
  KpiStrip,
  LoadingText,
  MetricChip,
  Panel,
  RankedList,
  RankedRow,
  SectionChrome,
  Text,
  ToggleGroup,
} from '../lib/msqdx-ui'
import { fetchSimilarityGraph } from '../lib/dig-api'
import {
  communityTone,
  neighborsFor,
  nodeDegree,
  shortGraphLabel,
  shortestPath,
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
  style_label: string
  layout_label: string
  contrast_label: string
  imagery_label: string
  type_label: string
  energy_label: string
  chrome_label: string
  industry_label: string
}

type ClusterBy =
  | 'contrast'
  | 'style'
  | 'layout'
  | 'imagery'
  | 'type'
  | 'energy'
  | 'chrome'
  | 'industry'

export function GraphPageClient() {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('craft')
  const [clusterBy, setClusterBy] = useState<ClusterBy>('contrast')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pathStartId, setPathStartId] = useState<string | null>(null)
  const [pathEndId, setPathEndId] = useState<string | null>(null)
  const [pathPickMode, setPathPickMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<'embeddings' | 'facets'>('embeddings')
  const [model, setModel] = useState('')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<Array<{ from_id: string; to_id: string; score: number }>>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState<number>(paths.similarityGraph.pageSize)
  const [visibleCount, setVisibleCount] = useState<number>(paths.similarityGraph.pageSize)
  const [loading, setLoading] = useState(true)
  const [loadingFull, setLoadingFull] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSelectedId(null)
    setPathStartId(null)
    setPathEndId(null)
    setPathPickMode(false)
    setVisibleCount(paths.similarityGraph.pageSize)
    setLoading(true)
    setLoadingFull(false)
    setError(null)

    const applyGraph = (graph: Awaited<ReturnType<typeof fetchSimilarityGraph>>, mode: 'preview' | 'full') => {
      if (cancelled) return
      setSource(graph.source)
      setModel(graph.model)
      setTotal(graph.total)
      setPageSize(graph.page_size || paths.similarityGraph.pageSize)
      if (mode === 'preview') {
        setVisibleCount(graph.page_size || paths.similarityGraph.pageSize)
      }
      setNodes(
        graph.nodes.map((node) => ({
          capture_run_id: node.capture_run_id,
          viewport_capture_id: node.viewport_capture_id,
          site_domain: node.site_domain,
          title: node.title,
          craft_label: node.craft_label,
          style_label: node.style_label,
          layout_label: node.layout_label,
          contrast_label: node.contrast_label,
          imagery_label: node.imagery_label,
          type_label: node.type_label,
          energy_label: node.energy_label,
          chrome_label: node.chrome_label,
          industry_label: node.industry_label,
        })),
      )
      setEdges(graph.edges)
    }

    void (async () => {
      try {
        const preview = await fetchSimilarityGraph(kind, {
          limit: paths.similarityGraph.pageSize,
        })
        applyGraph(preview, 'preview')
        if (cancelled) return
        setLoading(false)
        setLoadingFull(true)
        const full = await fetchSimilarityGraph(kind)
        applyGraph(full, 'full')
      } catch (err: unknown) {
        if (cancelled) return
        setNodes([])
        setEdges([])
        setTotal(0)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingFull(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [kind])

  const communityFor = (node: GraphNode) => {
    if (clusterBy === 'industry') return node.industry_label || 'unclassified'
    if (clusterBy === 'style') return node.style_label || 'unclassified'
    if (clusterBy === 'layout') return node.layout_label || 'unclassified'
    if (clusterBy === 'imagery') return node.imagery_label || 'unclassified'
    if (clusterBy === 'type') return node.type_label || 'unclassified'
    if (clusterBy === 'energy') return node.energy_label || 'unclassified'
    if (clusterBy === 'chrome') return node.chrome_label || 'unclassified'
    return node.contrast_label || 'unclassified'
  }

  const query = searchQuery.trim().toLowerCase()

  const visibleNodes = useMemo(() => {
    if (query) {
      return nodes.filter((node) =>
        [node.site_domain, node.title, node.craft_label, communityFor(node)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)),
      )
    }
    return nodes.slice(0, visibleCount)
  }, [nodes, visibleCount, query, clusterBy])

  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.capture_run_id)),
    [visibleNodes],
  )

  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleIds.has(edge.from_id) && visibleIds.has(edge.to_id)),
    [edges, visibleIds],
  )

  // Legend uses the full loaded corpus so communities do not appear only after "Load more".
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
      visibleNodes.map((node) => ({
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
    [visibleNodes, clusterBy],
  )

  const selected = useMemo(
    () => nodes.find((node) => node.capture_run_id === selectedId) ?? null,
    [nodes, selectedId],
  )

  const pathIds = useMemo(() => {
    if (!pathStartId || !pathEndId) return [] as string[]
    return shortestPath(pathStartId, pathEndId, edges) ?? []
  }, [pathStartId, pathEndId, edges])

  const pathMissing = Boolean(pathStartId && pathEndId && pathIds.length === 0)

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
  const corpusTotal = Math.max(total, nodes.length)
  const hasMore = !query && visibleCount < nodes.length

  const labelForId = (id: string | null) => {
    if (!id) return '—'
    const meta = nodes.find((node) => node.capture_run_id === id)
    return shortGraphLabel({
      domain: meta?.site_domain,
      title: meta?.title,
      craftLabel: meta?.craft_label,
    })
  }

  const onNodeSelect = (id: string) => {
    if (pathPickMode && pathStartId && id !== pathStartId) {
      setPathEndId(id)
      setSelectedId(id)
      setPathPickMode(false)
      return
    }
    setSelectedId(id)
  }

  const clearPath = () => {
    setPathStartId(null)
    setPathEndId(null)
    setPathPickMode(false)
  }

  return (
    <AppShell title={paths.libraryCopy.graphTitle} description={paths.libraryCopy.graphHint}>
      {error ? <Alert tone="info">{error}</Alert> : null}

      <Panel className="dig-panel">
        <div className="dig-stack">
          <FilterRow label={paths.libraryCopy.graphTitle} variant="toolbar">
            <ToggleGroup
              aria-label={paths.libraryCopy.graphTitle}
              value={kind}
              onChange={(value) => setKind(value === 'visual' ? 'visual' : 'craft')}
              options={[
                { value: 'craft', label: paths.libraryCopy.graphCraft },
                { value: 'visual', label: paths.libraryCopy.graphVisual },
              ]}
            />
          </FilterRow>

          <FilterRow label={paths.libraryCopy.graphCommunityBy} variant="toolbar">
            <ToggleGroup
              aria-label={paths.libraryCopy.graphCommunityBy}
              value={clusterBy}
              onChange={(value) => {
                const next = (
                  [
                    'contrast',
                    'style',
                    'layout',
                    'imagery',
                    'type',
                    'energy',
                    'chrome',
                    'industry',
                  ] as const
                ).includes(value as ClusterBy)
                  ? (value as ClusterBy)
                  : 'contrast'
                setClusterBy(next)
                setSelectedId(null)
                clearPath()
              }}
              options={[
                { value: 'contrast', label: paths.libraryCopy.graphByContrast },
                { value: 'style', label: paths.libraryCopy.graphByStyle },
                { value: 'layout', label: paths.libraryCopy.graphByLayout },
                { value: 'imagery', label: paths.libraryCopy.graphByImagery },
                { value: 'type', label: paths.libraryCopy.graphByType },
                { value: 'energy', label: paths.libraryCopy.graphByEnergy },
                { value: 'chrome', label: paths.libraryCopy.graphByChrome },
                { value: 'industry', label: paths.libraryCopy.graphByIndustry },
              ]}
            />
          </FilterRow>

          <KpiStrip
            items={[
              {
                id: 'nodes',
                label: paths.libraryCopy.graphShowing,
                value: `${visibleNodes.length} ${paths.libraryCopy.graphOf} ${corpusTotal}`,
              },
              { id: 'edges', label: 'Edges', value: visibleEdges.length },
              { id: 'communities', label: paths.libraryCopy.graphLegend, value: communities.length },
              {
                id: 'model',
                label: 'Source',
                value: source === 'facets' ? 'facets' : model || 'embeddings',
              },
            ]}
          />

          <Field label={paths.libraryCopy.graphSearch} size="sm">
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={paths.libraryCopy.graphSearchPlaceholder}
            />
          </Field>

          <Text role="hint">{paths.libraryCopy.graphifyHint}</Text>
          {loading ? <LoadingText>{paths.libraryCopy.graphLoading}</LoadingText> : null}
          {loadingFull ? <LoadingText>{paths.libraryCopy.graphLoadingFull}</LoadingText> : null}
          {pathPickMode ? <Text role="hint">{paths.libraryCopy.graphPathPickHint}</Text> : null}
          {source === 'facets' ? <Text role="hint">{paths.libraryCopy.graphFacets}</Text> : null}
          {!loading && !error && !visibleEdges.length ? (
            <Text role="hint">
              {kind === 'visual'
                ? paths.libraryCopy.graphEmptyVisual
                : paths.libraryCopy.graphEmptyCraft}
            </Text>
          ) : null}

          <div className="dig-graph-shell">
            <Panel className="dig-graph-side" aria-label={paths.libraryCopy.graphLegend}>
              <SectionChrome title={paths.libraryCopy.graphLegend} meta={`${communities.length}`} as="h2" quiet />
              {communities.length === 0 ? (
                <Text role="hint">{paths.libraryCopy.graphInspectorEmpty}</Text>
              ) : (
                <RankedList>
                  {communities.map((community, index) => {
                    const tone = communityTone(community.label, communityOrder)
                    return (
                      <RankedRow
                        key={community.label}
                        index={index + 1}
                        active={searchQuery.trim().toLowerCase() === community.label.toLowerCase()}
                        label={
                          <span className="dig-graph-legend-label">
                            <span className="dig-graph-swatch" style={{ background: tone.fill }} />
                            {community.label}
                          </span>
                        }
                        value={community.count}
                        onActivate={() => setSearchQuery(community.label)}
                      />
                    )
                  })}
                </RankedList>
              )}
            </Panel>

            <Panel className="dig-graph-canvas">
              <SimilarityGraphView
                ariaLabel={paths.libraryCopy.graphTitle}
                nodes={viewNodes}
                edges={visibleEdges}
                selectedId={selectedId}
                pathNodeIds={pathIds}
                searchQuery={searchQuery}
                onNodeSelect={onNodeSelect}
              />
              {hasMore ? (
                <div className="dig-row" style={{ marginTop: '0.75rem' }}>
                  <Button
                    type="button"
                    variant="subtle"
                    size="sm"
                    onClick={() => setVisibleCount((count) => Math.min(nodes.length, count + pageSize))}
                  >
                    {paths.libraryCopy.graphLoadMore} ({nodes.length - visibleCount})
                  </Button>
                </div>
              ) : null}
            </Panel>

            <Panel className="dig-graph-side" aria-label={paths.libraryCopy.graphInspector}>
              <SectionChrome title={paths.libraryCopy.graphInspector} as="h2" quiet />
              {!selected ? (
                <Text role="hint">{paths.libraryCopy.graphInspectorEmpty}</Text>
              ) : (
                <div className="dig-stack">
                  <Text role="display" as="h3">
                    {shortGraphLabel({
                      domain: selected.site_domain,
                      title: selected.title,
                      craftLabel: selected.craft_label,
                    })}
                  </Text>
                  <div className="dig-row">
                    <Chip size="sm" static={true}>
                      {communityFor(selected)}
                    </Chip>
                    <MetricChip label={paths.libraryCopy.graphDegree}>{selectedDegree}</MetricChip>
                  </div>
                  <Text role="body">{selected.craft_label}</Text>
                  {selected.title ? <Text role="meta">{selected.title}</Text> : null}

                  <SectionChrome
                    title={paths.libraryCopy.graphPath}
                    meta={
                      pathIds.length > 1
                        ? `${pathIds.length - 1} ${paths.libraryCopy.graphPathHops}`
                        : undefined
                    }
                    as="h3"
                    quiet
                  />
                  <Text role="meta">
                    {labelForId(pathStartId)} → {labelForId(pathEndId)}
                  </Text>
                  {pathMissing ? <Text role="hint">{paths.libraryCopy.graphPathMissing}</Text> : null}
                  <div className="dig-row">
                    <Button
                      type="button"
                      variant="subtle"
                      size="sm"
                      onClick={() => {
                        setPathStartId(selected.capture_run_id)
                        setPathEndId(null)
                        setPathPickMode(true)
                      }}
                    >
                      {paths.libraryCopy.graphPathFromHere}
                    </Button>
                    {pathStartId || pathEndId || pathPickMode ? (
                      <Button type="button" variant="ghost" size="sm" onClick={clearPath}>
                        {paths.libraryCopy.graphPathClear}
                      </Button>
                    ) : null}
                  </div>
                  {pathIds.length > 1 ? (
                    <RankedList hint={paths.libraryCopy.graphPath}>
                      {pathIds.map((id, index) => (
                        <RankedRow
                          key={id}
                          index={index + 1}
                          label={labelForId(id)}
                          active={id === selectedId}
                          onActivate={() => setSelectedId(id)}
                        />
                      ))}
                    </RankedList>
                  ) : null}

                  <SectionChrome title={paths.libraryCopy.graphNeighbors} as="h3" quiet />
                  {selectedNeighbors.length === 0 ? (
                    <Text role="hint">{paths.libraryCopy.graphNoNeighbors}</Text>
                  ) : (
                    <RankedList>
                      {selectedNeighbors.map((neighbor, index) => (
                        <RankedRow
                          key={neighbor.id}
                          index={index + 1}
                          label={neighbor.label}
                          value={neighbor.score.toFixed(2)}
                          barPct={neighbor.score * 100}
                          active={neighbor.id === selectedId}
                          onActivate={() => {
                            if (pathPickMode && pathStartId) {
                              setPathEndId(neighbor.id)
                              setSelectedId(neighbor.id)
                              setPathPickMode(false)
                              return
                            }
                            setSelectedId(neighbor.id)
                          }}
                        />
                      ))}
                    </RankedList>
                  )}

                  {selected.viewport_capture_id ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => router.push(libraryScreenHref(selected.viewport_capture_id!))}
                    >
                      {paths.libraryCopy.graphOpenLibrary}
                    </Button>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </Panel>
    </AppShell>
  )
}

