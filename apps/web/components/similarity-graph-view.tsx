'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createForceSimulation, stepForceSimulation, type ForceNode } from '../lib/similarity-graph-force'
import type { GraphLayoutEdge } from '../lib/similarity-graph-layout'

type Props = {
  nodes: Array<{ id: string; label: string; cluster?: string; contrast?: string; href?: string | null }>
  edges: GraphLayoutEdge[]
  onNodeClick?: (id: string) => void
  onClusterClick?: (cluster: string) => void
  width?: number
  height?: number
  ariaLabel: string
  clusterMode?: 'clusters' | 'nodes'
  clusterBy?: 'style' | 'contrast'
}

export function SimilarityGraphView({
  nodes,
  edges,
  onNodeClick,
  onClusterClick,
  width = 960,
  height = 560,
  ariaLabel,
  clusterMode = 'clusters',
  clusterBy = 'contrast',
}: Props) {
  const [placed, setPlaced] = useState<ForceNode[]>([])
  const simRef = useRef<ForceNode[]>([])
  const frameRef = useRef<number | null>(null)

  const computed = useMemo(() => {
    if (clusterMode !== 'clusters') {
      return {
        simNodes: nodes.map((n) => ({ id: n.id, label: n.label })),
        simEdges: edges,
        displayMetaById: new Map(nodes.map((n) => [n.id, n] as const)),
      }
    }

    const clusterKeyFor = (node: (typeof nodes)[number]): string => {
      const key = clusterBy === 'style' ? node.cluster : node.contrast
      const normalized = (key ?? 'mixed').trim() || 'mixed'
      return normalized
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n] as const))
    const clusterStats = new Map<
      string,
      { id: string; label: string; count: number; href: string | null; cluster?: string; contrast?: string }
    >()
    for (const n of nodes) {
      const key = clusterKeyFor(n)
      const current = clusterStats.get(key)
      if (!current) {
        clusterStats.set(key, {
          id: key,
          label: key,
          count: 1,
          href: null,
          cluster: n.cluster,
          contrast: n.contrast,
        })
      } else {
        current.count += 1
      }
    }

    const edgeAgg = new Map<string, { from_id: string; to_id: string; sum: number; count: number }>()
    for (const e of edges) {
      const a = nodeById.get(e.from_id)
      const b = nodeById.get(e.to_id)
      if (!a || !b) continue
      const ca = clusterKeyFor(a)
      const cb = clusterKeyFor(b)
      if (ca === cb) continue
      const k = ca < cb ? `${ca}__${cb}` : `${cb}__${ca}`
      const curr = edgeAgg.get(k)
      if (!curr) {
        edgeAgg.set(k, { from_id: ca, to_id: cb, sum: e.score, count: 1 })
      } else {
        curr.sum += e.score
        curr.count += 1
      }
    }

    const simNodes = [...clusterStats.values()].map((c) => ({ id: c.id, label: c.label }))
    const simEdges: GraphLayoutEdge[] = [...edgeAgg.values()].map((agg) => ({
      from_id: agg.from_id,
      to_id: agg.to_id,
      score: agg.sum / Math.max(1, agg.count),
    }))

    return {
      simNodes,
      simEdges,
      displayMetaById: new Map(
        [...clusterStats.values()].map((c) => [
          c.id,
          {
            id: c.id,
            label: c.label,
            cluster: c.cluster,
            contrast: c.contrast,
            href: c.href,
            count: c.count,
          },
        ] as const),
      ),
    }
  }, [nodes, edges, clusterMode, clusterBy])

  useEffect(() => {
    simRef.current = createForceSimulation(computed.simNodes, width, height)
    setPlaced(simRef.current.map((node) => ({ ...node })))

    const tick = () => {
      stepForceSimulation(simRef.current, computed.simEdges, width, height)
      setPlaced(simRef.current.map((node) => ({ ...node })))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [computed.simNodes, computed.simEdges, width, height])

  const toneFor = (meta: { cluster?: string; contrast?: string } | undefined): string => {
    const key = (clusterMode === 'clusters'
      ? clusterBy === 'style'
        ? meta?.cluster
        : meta?.contrast
      : meta?.cluster) ?? 'mixed'
    const k = (key ?? 'mixed').toLowerCase()
    if (k.includes('modern') || k.includes('minimal')) return '#84dcc6'
    if (k.includes('editorial') || k.includes('type')) return '#ffcc66'
    if (k.includes('image')) return '#ff8fab'
    if (k.includes('dense') || k.includes('chrome')) return '#9fa8ff'
    if (k.includes('energy')) return '#ff7b72'
    if (k.includes('monochrome')) return '#84dcc6'
    if (k.includes('saturated')) return '#ff7b72'
    return '#8fd3ff'
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="dig-graph">
      {computed.simEdges.map((edge) => {
        const from = placed.find((node) => node.id === edge.from_id)
        const to = placed.find((node) => node.id === edge.to_id)
        if (!from || !to) return null
        return (
          <line
            key={`${edge.from_id}-${edge.to_id}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="currentColor"
            strokeOpacity={0.25 + edge.score * 0.55}
            strokeWidth={1 + edge.score}
          />
        )
      })}
      {placed.map((node) => {
        const meta = computed.displayMetaById.get(node.id)
        const clickable = clusterMode === 'clusters'
          ? Boolean(onClusterClick)
          : Boolean(meta?.href && onNodeClick)
        const r = clusterMode === 'clusters' ? 11 + Math.min(11, (meta as any)?.count ?? 0) * 0.35 : 7
        return (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
            onClick={() => {
              if (!clickable) return
              if (clusterMode === 'clusters') {
                onClusterClick?.(node.id)
                return
              }
              if (onNodeClick) onNodeClick(node.id)
            }}
          >
            <title>
              {clusterMode === 'clusters'
                ? `${meta?.label ?? node.label}${(meta as any)?.count ? ` (${(meta as any).count})` : ''}`
                : node.label}
            </title>
            <circle r={r} fill={toneFor(meta as any)} />
            <text x={r + 4} y={4} fontSize={11} fill="currentColor">
              {node.label}
            </text>
            {clusterMode === 'clusters' ? (
              <text x={r + 4} y={18} fontSize={9} fill="currentColor" opacity={0.8}>
                {(meta as any)?.count ? `${(meta as any).count} nodes` : ''}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
