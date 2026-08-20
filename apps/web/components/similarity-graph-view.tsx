'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  communityTone,
  godNodeRadius,
  hullPath,
  nodeDegree,
} from '../lib/graphify-communities'
import { createForceSimulation, stepForceSimulation, type ForceNode } from '../lib/similarity-graph-force'
import type { GraphLayoutEdge } from '../lib/similarity-graph-layout'

export type GraphViewNode = {
  id: string
  label: string
  community: string
  domain?: string | null
  title?: string | null
  craftLabel?: string | null
  href?: string | null
}

type Props = {
  nodes: GraphViewNode[]
  edges: GraphLayoutEdge[]
  selectedId?: string | null
  searchQuery?: string
  onNodeSelect?: (id: string) => void
  width?: number
  height?: number
  ariaLabel: string
}

export function SimilarityGraphView({
  nodes,
  edges,
  selectedId = null,
  searchQuery = '',
  onNodeSelect,
  width = 960,
  height = 560,
  ariaLabel,
}: Props) {
  const [placed, setPlaced] = useState<ForceNode[]>([])
  const simRef = useRef<ForceNode[]>([])
  const frameRef = useRef<number | null>(null)

  const communities = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of nodes) {
      counts.set(node.community, (counts.get(node.community) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label)
  }, [nodes])

  const degreeById = useMemo(() => {
    const map = new Map<string, number>()
    let max = 0
    for (const node of nodes) {
      const degree = nodeDegree(node.id, edges)
      map.set(node.id, degree)
      if (degree > max) max = degree
    }
    return { map, max }
  }, [nodes, edges])

  const query = searchQuery.trim().toLowerCase()

  const matchesQuery = (node: GraphViewNode): boolean => {
    if (!query) return true
    return [node.label, node.domain, node.title, node.craftLabel, node.community]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  }

  useEffect(() => {
    simRef.current = createForceSimulation(
      nodes.map((n) => ({ id: n.id, label: n.label, community: n.community })),
      width,
      height,
    )
    setPlaced(simRef.current.map((node) => ({ ...node })))

    const tick = () => {
      stepForceSimulation(simRef.current, edges, width, height)
      setPlaced(simRef.current.map((node) => ({ ...node })))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [nodes, edges, width, height])

  const metaById = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes])

  const hulls = useMemo(() => {
    const byCommunity = new Map<string, Array<{ x: number; y: number }>>()
    for (const node of placed) {
      const meta = metaById.get(node.id)
      const community = meta?.community ?? node.community ?? 'mixed'
      const list = byCommunity.get(community) ?? []
      list.push({ x: node.x, y: node.y })
      byCommunity.set(community, list)
    }
    return [...byCommunity.entries()]
      .map(([community, points]) => {
        const path = hullPath(points, 22)
        if (!path) return null
        return { community, path, tone: communityTone(community, communities) }
      })
      .filter(Boolean) as Array<{ community: string; path: string; tone: ReturnType<typeof communityTone> }>
  }, [placed, metaById, communities])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="dig-graph">
      {hulls.map((hull) => (
        <path
          key={hull.community}
          d={hull.path}
          fill={hull.tone.hull}
          stroke={hull.tone.stroke}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
      ))}
      {edges.map((edge) => {
        const from = placed.find((node) => node.id === edge.from_id)
        const to = placed.find((node) => node.id === edge.to_id)
        if (!from || !to) return null
        const active =
          selectedId === edge.from_id || selectedId === edge.to_id || (!selectedId && !query)
        return (
          <line
            key={`${edge.from_id}-${edge.to_id}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke="currentColor"
            strokeOpacity={active ? 0.22 + edge.score * 0.45 : 0.06}
            strokeWidth={1 + edge.score}
          />
        )
      })}
      {placed.map((node) => {
        const meta = metaById.get(node.id)
        if (!meta) return null
        const tone = communityTone(meta.community, communities)
        const degree = degreeById.map.get(node.id) ?? 0
        const r = godNodeRadius(degree, degreeById.max)
        const match = matchesQuery(meta)
        const selected = selectedId === node.id
        const dimmed = Boolean(query) && !match
        return (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            style={{ cursor: onNodeSelect ? 'pointer' : 'default', opacity: dimmed ? 0.18 : 1 }}
            onClick={() => onNodeSelect?.(node.id)}
          >
            <title>
              {meta.domain || meta.label}
              {meta.craftLabel ? ` · ${meta.craftLabel}` : ''}
              {` · degree ${degree}`}
            </title>
            {selected ? (
              <circle r={r + 5} fill="none" stroke={tone.stroke} strokeWidth={2} opacity={0.9} />
            ) : null}
            <circle
              r={r}
              fill={tone.fill}
              stroke={selected || match && query ? tone.stroke : 'transparent'}
              strokeWidth={selected || (match && query) ? 2 : 0}
            />
            <text x={r + 4} y={4} fontSize={11} fill="currentColor">
              {meta.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
