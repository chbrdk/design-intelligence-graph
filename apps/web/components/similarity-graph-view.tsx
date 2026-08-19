'use client'

import { useEffect, useRef, useState } from 'react'
import { createForceSimulation, stepForceSimulation, type ForceNode } from '../lib/similarity-graph-force'
import type { GraphLayoutEdge } from '../lib/similarity-graph-layout'

type Props = {
  nodes: Array<{ id: string; label: string; cluster?: string; href?: string | null }>
  edges: GraphLayoutEdge[]
  onNodeClick?: (id: string) => void
  width?: number
  height?: number
  ariaLabel: string
}

export function SimilarityGraphView({
  nodes,
  edges,
  onNodeClick,
  width = 960,
  height = 560,
  ariaLabel,
}: Props) {
  const [placed, setPlaced] = useState<ForceNode[]>([])
  const simRef = useRef<ForceNode[]>([])
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    simRef.current = createForceSimulation(
      nodes.map((node) => ({ id: node.id, label: node.label })),
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

  const toneFor = (cluster: string | undefined): string => {
    const key = (cluster ?? 'mixed').toLowerCase()
    if (key.includes('modern') || key.includes('minimal')) return '#84dcc6'
    if (key.includes('editorial') || key.includes('type')) return '#ffcc66'
    if (key.includes('image')) return '#ff8fab'
    if (key.includes('dense') || key.includes('chrome')) return '#9fa8ff'
    if (key.includes('energy')) return '#ff7b72'
    return '#8fd3ff'
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="dig-graph">
      {edges.map((edge) => {
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
            strokeOpacity={0.35 + edge.score * 0.4}
            strokeWidth={1 + edge.score}
          />
        )
      })}
      {placed.map((node) => {
        const meta = nodes.find((item) => item.id === node.id)
        const clickable = Boolean(meta?.href && onNodeClick)
        return (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            style={{ cursor: clickable ? 'pointer' : 'default' }}
            onClick={() => {
              if (clickable && onNodeClick) onNodeClick(node.id)
            }}
          >
            <title>{meta?.cluster ? `${meta.cluster} — ${node.label}` : node.label}</title>
            <circle r={7} fill={toneFor(meta?.cluster)} />
            <text x={10} y={4} fontSize={11} fill="currentColor">
              {node.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
