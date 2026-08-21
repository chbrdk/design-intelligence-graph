'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Button, MetricChip } from '../lib/msqdx-ui'
import {
  communityTone,
  edgeKey,
  godNodeRadius,
  hullPath,
  nodeDegree,
} from '../lib/graphify-communities'
import { createForceSimulation, stepForceSimulation, type ForceNode } from '../lib/similarity-graph-force'
import type { GraphLayoutEdge } from '../lib/similarity-graph-layout'
import { paths } from '../lib/paths'

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
  pathNodeIds?: string[]
  searchQuery?: string
  onNodeSelect?: (id: string) => void
  onResetView?: () => void
  /** Logical layout size; ignored when fillParent measures the container. */
  width?: number
  height?: number
  /** Fill the parent box (100% of stage) and drive layout from ResizeObserver. */
  fillParent?: boolean
  /** Hide built-in zoom chrome when overlays own it. */
  showZoomBar?: boolean
  ariaLabel: string
}

export function SimilarityGraphView({
  nodes,
  edges,
  selectedId = null,
  pathNodeIds = [],
  searchQuery = '',
  onNodeSelect,
  width: widthProp = 1100,
  height: heightProp = 720,
  fillParent = false,
  showZoomBar = true,
  ariaLabel,
}: Props) {
  const [placed, setPlaced] = useState<ForceNode[]>([])
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [size, setSize] = useState({ width: widthProp, height: heightProp })
  const simRef = useRef<ForceNode[]>([])
  const frameRef = useRef<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const width = fillParent ? size.width : widthProp
  const height = fillParent ? size.height : heightProp

  useEffect(() => {
    if (!fillParent) {
      setSize({ width: widthProp, height: heightProp })
      return
    }
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const rect = root.getBoundingClientRect()
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(240, Math.round(rect.height)),
      })
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(root)
    return () => ro.disconnect()
  }, [fillParent, widthProp, heightProp])

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

  const pathSet = useMemo(() => new Set(pathNodeIds), [pathNodeIds])
  const pathEdges = useMemo(() => {
    const keys = new Set<string>()
    for (let i = 0; i < pathNodeIds.length - 1; i += 1) {
      keys.add(edgeKey(pathNodeIds[i]!, pathNodeIds[i + 1]!))
    }
    return keys
  }, [pathNodeIds])

  const query = searchQuery.trim().toLowerCase()

  const matchesQuery = (node: GraphViewNode): boolean => {
    if (!query) return true
    return [node.label, node.domain, node.title, node.craftLabel, node.community]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  }

  useEffect(() => {
    if (width < 32 || height < 32) return
    simRef.current = createForceSimulation(
      nodes.map((n) => ({ id: n.id, label: n.label, community: n.community })),
      width,
      height,
    )
    setPlaced(simRef.current.map((node) => ({ ...node })))
    setTransform({ x: 0, y: 0, k: 1 })

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

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((event.clientX - rect.left) / rect.width) * width
    const my = ((event.clientY - rect.top) / rect.height) * height
    const factor = event.deltaY < 0 ? 1.08 : 0.92
    setTransform((prev) => {
      const nextK = Math.min(4, Math.max(0.35, prev.k * factor))
      const scale = nextK / prev.k
      return {
        k: nextK,
        x: mx - (mx - prev.x) * scale,
        y: my - (my - prev.y) * scale,
      }
    })
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    const target = event.target as Element
    if (target.closest('[data-graph-node="1"]')) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dx = ((event.clientX - drag.startX) / rect.width) * width
    const dy = ((event.clientY - drag.startY) / rect.height) * height
    setTransform((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }))
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  return (
    <div
      ref={rootRef}
      className={`dig-graph-viewport${fillParent ? ' dig-graph-viewport--fill' : ''}`}
    >
      {showZoomBar ? (
        <div className="dig-row dig-graph-zoombar">
          <Button type="button" variant="ghost" size="sm" onClick={() => setTransform({ x: 0, y: 0, k: 1 })}>
            {paths.libraryCopy.graphResetView}
          </Button>
          <MetricChip label="Zoom">{`${Math.round(transform.k * 100)}%`}</MetricChip>
        </div>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="dig-graph"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
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
            const onPath = pathEdges.has(edgeKey(edge.from_id, edge.to_id))
            const active =
              onPath ||
              selectedId === edge.from_id ||
              selectedId === edge.to_id ||
              (!selectedId && !query && pathSet.size === 0)
            return (
              <line
                key={`${edge.from_id}-${edge.to_id}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={onPath ? 'var(--accent)' : 'currentColor'}
                strokeOpacity={onPath ? 0.95 : active ? 0.22 + edge.score * 0.45 : 0.06}
                strokeWidth={onPath ? 3.5 : 1 + edge.score}
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
            const onPath = pathSet.has(node.id)
            const dimmed =
              (Boolean(query) && !match && !onPath && !selected) ||
              (pathSet.size > 0 && !onPath && !selected && !query)
            return (
              <g
                key={node.id}
                data-graph-node="1"
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: onNodeSelect ? 'pointer' : 'default', opacity: dimmed ? 0.16 : 1 }}
                onClick={(event) => {
                  event.stopPropagation()
                  onNodeSelect?.(node.id)
                }}
              >
                <title>
                  {meta.domain || meta.label}
                  {meta.craftLabel ? ` · ${meta.craftLabel}` : ''}
                  {` · degree ${degree}`}
                </title>
                {selected || onPath ? (
                  <circle
                    r={r + 5}
                    fill="none"
                    stroke={onPath ? 'var(--accent)' : tone.stroke}
                    strokeWidth={2}
                    opacity={0.95}
                  />
                ) : null}
                <circle
                  r={r}
                  fill={tone.fill}
                  stroke={selected || (match && query) || onPath ? tone.stroke : 'transparent'}
                  strokeWidth={selected || (match && query) || onPath ? 2 : 0}
                />
                <text x={r + 4} y={4} fontSize={11} fill="currentColor">
                  {meta.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
