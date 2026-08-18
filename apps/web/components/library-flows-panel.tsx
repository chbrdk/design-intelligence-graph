'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Field, Input, Panel, Text } from '../lib/msqdx-ui'
import {
  fetchDesignFlowInteractive,
  fetchDesignFlows,
  islandMediaUrl,
  type DesignFlowInteractive,
  type DesignFlowListItem,
} from '../lib/dig-api'
import { labelForFlowAction, listFlowActionFilterOptions } from '../lib/flow-action-options'
import { formatLibraryHash, nextInteractiveStep } from '../lib/library-hash'
import { paths } from '../lib/paths'

type FlowsView = 'list' | 'interactive'

export function LibraryFlowsPanel(props: {
  initialFlowId?: string | null
  initialInteractive?: boolean
  initialStep?: string | null
  onNavigateHash: (hash: string) => void
}) {
  const [view, setView] = useState<FlowsView>(
    props.initialFlowId ? 'interactive' : 'list',
  )
  const [flowAction, setFlowAction] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<DesignFlowListItem[]>([])
  const [interactive, setInteractive] = useState<DesignFlowInteractive | null>(null)
  const [stepId, setStepId] = useState<string | null>(props.initialStep ?? null)
  const [error, setError] = useState<string | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const actionOptions = useMemo(() => listFlowActionFilterOptions(), [])

  const loadList = useCallback(async () => {
    try {
      setError(null)
      setItems(
        await fetchDesignFlows({
          ...(flowAction ? { flow_action: flowAction } : {}),
          ...(query.trim() ? { q: query.trim() } : {}),
          limit: 40,
        }),
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setItems([])
    }
  }, [flowAction, query])

  const openInteractive = useCallback(
    async (flowId: string, step?: string | null) => {
      try {
        setError(null)
        const payload = await fetchDesignFlowInteractive(flowId)
        setInteractive(payload)
        const start = step || payload.start_screen_id
        setStepId(start)
        setImageReady(false)
        window.setTimeout(() => setImageReady(true), 120)
        setView('interactive')
        props.onNavigateHash(
          formatLibraryHash({
            view: 'flow_interactive',
            flowId,
            ...(start ? { step: start } : {}),
          }),
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [props],
  )

  useEffect(() => {
    if (view === 'list') void loadList()
  }, [view, loadList])

  useEffect(() => {
    if (props.initialFlowId) {
      void openInteractive(props.initialFlowId, props.initialStep)
    } else {
      void loadList()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap from hash
  }, [])

  const currentStep = interactive?.steps.find((step) => step.flow_screen_id === stepId) ?? null

  function goHotspot(toScreenId: string) {
    if (!interactive) return
    setStepId(toScreenId)
    setImageReady(false)
    window.setTimeout(() => setImageReady(true), 120)
    props.onNavigateHash(
      formatLibraryHash({
        view: 'flow_interactive',
        flowId: interactive.flow_id,
        step: toScreenId,
      }),
    )
  }

  function onAdvanceAnywhere() {
    if (!interactive || !stepId || !currentStep) return
    if (currentStep.hotspots.length >= 2) return
    const next = nextInteractiveStep({
      steps: interactive.steps,
      currentScreenId: stepId,
    })
    if (next) goHotspot(next)
  }

  useEffect(() => {
    if (view !== 'interactive' || !interactive || !stepId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setView('list')
        setInteractive(null)
        props.onNavigateHash(formatLibraryHash({ view: 'flows' }))
        return
      }
      const index = interactive.steps.findIndex((step) => step.flow_screen_id === stepId)
      if (event.key === 'ArrowRight') {
        const step = interactive.steps[index]
        if (step && step.hotspots.length < 2) {
          const next = nextInteractiveStep({ steps: interactive.steps, currentScreenId: stepId })
          if (next) goHotspot(next)
        }
      }
      if (event.key === 'ArrowLeft' && index > 0) {
        goHotspot(interactive.steps[index - 1]!.flow_screen_id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (view === 'interactive' && interactive) {
    const stepIndex = interactive.steps.findIndex((step) => step.flow_screen_id === stepId) + 1
    const title = interactive.flow_id
    return (
      <Panel className="dig-panel dig-flow-interactive">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="dig-row dig-flow-interactive-bar">
          <Text role="title">{title}</Text>
          <Text role="meta">
            {stepIndex} / {interactive.steps.length}
          </Text>
          <Button
            type="button"
            variant="subtle"
            onClick={() => {
              setView('list')
              setInteractive(null)
              props.onNavigateHash(formatLibraryHash({ view: 'flows' }))
            }}
          >
            Exit
          </Button>
        </div>
        <div
          className={`dig-flow-stage${imageReady ? ' is-ready' : ''}`}
          onClick={() => onAdvanceAnywhere()}
          onKeyDown={() => undefined}
          role="presentation"
        >
          {(() => {
            const mediaSrc = islandMediaUrl(currentStep?.image_ref)
            if (mediaSrc) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaSrc}
                  alt={`${title} · ${currentStep?.flow_screen_id ?? 'step'}`}
                  className="dig-flow-stage-image"
                  onLoad={() => setImageReady(true)}
                />
              )
            }
            return (
              <div className="dig-flow-stage-placeholder">
                <Text role="meta">{currentStep?.primary_url ?? 'No media'}</Text>
                <Text role="hint">
                  Pre-captured screenshot missing for this capture — hotspot graph still works.
                </Text>
              </div>
            )
          })()}
          <div className={`dig-flow-hotspots is-visible`}>
            {currentStep?.hotspots.map((hotspot) => (
              <button
                key={hotspot.edge_id}
                type="button"
                className={`dig-flow-hotspot${currentStep.hotspots.length >= 2 ? ' is-branch' : ''}`}
                style={{
                  left: `${hotspot.box.x * 100}%`,
                  top: `${hotspot.box.y * 100}%`,
                  width: `${Math.max(hotspot.box.width * 100, 4)}%`,
                  height: `${Math.max(hotspot.box.height * 100, 3)}%`,
                }}
                aria-label={`Go to ${hotspot.to_screen_id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  goHotspot(hotspot.to_screen_id)
                }}
              />
            ))}
          </div>
        </div>
        <Text role="meta">
          Outbound:{' '}
          {currentStep?.hotspots.map((hotspot) => hotspot.to_screen_id).join(' · ') ||
            (currentStep?.advance_anywhere ? 'advance anywhere' : '—')}
        </Text>
      </Panel>
    )
  }

  return (
    <Panel className="dig-panel">
      <Text role="title">{paths.libraryCopy.flowsLabel}</Text>
      <Text role="hint">{paths.libraryCopy.flowsGalleryHint}</Text>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="dig-row">
        <Field label="Action">
          <select
            className="dig-select"
            value={flowAction}
            onChange={(event) => setFlowAction(event.target.value)}
          >
            <option value="">All</option>
            {actionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <Button type="button" variant="subtle" onClick={() => void loadList()}>
          Apply
        </Button>
        <Button
          type="button"
          variant="subtle"
          onClick={() => {
            setFlowAction('')
            setQuery('')
          }}
        >
          Clear
        </Button>
      </div>
      <ul className="dig-screen-grid">
        {items.map((item) => {
          const thumb = islandMediaUrl(item.preview_url)
          return (
            <li key={item.flow_id}>
              <button
                type="button"
                className="dig-screen-card"
                onClick={() => void openInteractive(item.flow_id)}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- package media via dig proxy
                  <img src={thumb} alt="" className="dig-screen-thumb" loading="lazy" />
                ) : (
                  <div className="dig-screen-thumb dig-screen-thumb--empty">No shot</div>
                )}
                <strong>{item.title || item.flow_id}</strong>
                <Text role="meta">
                  {item.flow_action_ids.map(labelForFlowAction).join(' · ') || '—'} · {item.screen_count}{' '}
                  screens
                </Text>
              </button>
            </li>
          )
        })}
      </ul>
      {!items.length ? <Text role="hint">{paths.libraryCopy.flowsEmpty}</Text> : null}
    </Panel>
  )
}
