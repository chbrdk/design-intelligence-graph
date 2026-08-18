'use client'

import { useEffect, useMemo, useState } from 'react'
import { Accordion, Alert, Panel, SectionChrome, Text } from '../lib/msqdx-ui'
import {
  fetchAnalysisDetail,
  fetchEnrichmentJobs,
  fetchPageFlows,
  fetchScreenDetail,
  islandMediaUrl,
  type EnrichmentJob,
  type LibraryAnalysisDetail,
  type LibraryScreen,
  type ScreenHotspot,
} from '../lib/dig-api'
import { paths } from '../lib/paths'
import { ScreenInsightStrip } from './screen-insight-strip'
import { ScreenDetailSplit } from './screen-detail-split'
import { VisualCraftPanel } from './visual-craft-panel'
import { UxAssessmentPanel } from './ux-assessment-panel'
import { FunctionalityPanel } from './functionality-panel'
import { SpecAtomGrid } from './spec-atom-grid'
import {
  pageFlowFromItems,
  sectionSpecAtoms,
} from '../lib/spec-atoms'

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function sectionHotspots(hotspots: ScreenHotspot[]): ScreenHotspot[] {
  return hotspots.filter((item) => item.role === 'section' && item.normalized)
}

export function LibraryScreenDetailPanel(props: {
  viewportCaptureId: string
}) {
  const [screen, setScreen] = useState<LibraryScreen | null>(null)
  const [hotspots, setHotspots] = useState<ScreenHotspot[]>([])
  const [visionNotes, setVisionNotes] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<LibraryAnalysisDetail | null>(null)
  const [pageNarrative, setPageNarrative] = useState<
    Array<{ section_label?: string; signature?: string | null }>
  >([])
  const [analysisPending, setAnalysisPending] = useState(true)
  const [enrichmentHint, setEnrichmentHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(null)
      setAnalysis(null)
      setPageNarrative([])
      setAnalysisPending(true)
      setEnrichmentHint(null)
      setOpenSectionId(null)

      let runId: string | null = null
      try {
        const detail = await fetchScreenDetail(props.viewportCaptureId)
        if (cancelled) return
        setScreen(detail.screen)
        setHotspots(detail.hotspots)
        setVisionNotes(detail.vision_layout?.notes ?? null)
        runId = detail.screen.capture_run_id
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setAnalysisPending(false)
        }
        return
      }

      if (!runId || cancelled) return

      const loadNarrative = async () => {
        try {
          const flows = await fetchPageFlows(runId!)
          if (!cancelled) setPageNarrative(flows.steps)
        } catch {
          if (!cancelled) setPageNarrative([])
        }
      }
      void loadNarrative()

      const deadline = Date.now() + 8 * 60 * 1000
      while (!cancelled && Date.now() < deadline) {
        let job: EnrichmentJob | undefined
        try {
          const jobs = await fetchEnrichmentJobs()
          job = jobs.find((item) => item.capture_run_id === runId)
          if (job && !cancelled) {
            setEnrichmentHint(`${job.status}: ${job.message}${job.error ? ` (${job.error})` : ''}`)
          }
        } catch {
          /* optional */
        }

        if (job?.status === 'failed' || job?.status === 'skipped') {
          if (!cancelled) {
            setAnalysisPending(false)
            setError(job.error || job.message || `Enrichment ${job.status}`)
          }
          return
        }

        try {
          const analysisDetail = await fetchAnalysisDetail(runId)
          if (cancelled) return
          setAnalysis(analysisDetail)
          setAnalysisPending(false)
          if (job?.message) setEnrichmentHint(job.message)
          const fromItems = pageFlowFromItems(analysisDetail.items)
          if (fromItems.length) {
            setPageNarrative(fromItems)
          } else {
            await loadNarrative()
          }
          return
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          const missing = /analysis_not_found|404|failed \(404\)/i.test(message)
          if (!missing) {
            if (!cancelled) {
              setAnalysisPending(false)
              setError(message)
            }
            return
          }
        }
        await sleep(3000)
      }
      if (!cancelled) {
        setAnalysisPending(false)
        setEnrichmentHint((prev) => prev ?? 'Timed out waiting for enrichment')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [props.viewportCaptureId])

  const sectionLooks = analysis?.section_look ?? []
  const overlays = useMemo(() => sectionHotspots(hotspots), [hotspots])
  const facets = analysis?.package?.design_facets ?? null
  const layoutNotes =
    analysis?.package?.vision_layout?.notes ?? visionNotes ?? null

  const mediaUrl = islandMediaUrl(
    screen?.full_page_url ?? screen?.settled_url ?? screen?.primary_url,
  )

  function selectSection(sectionId: string) {
    setOpenSectionId(sectionId)
    const chapter = document.getElementById(`dig-section-spec-${sectionId}`)
    chapter?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const summary = analysis?.analysis.design_summary?.trim() || ''
  const visualCraft = analysis?.package?.vision_page?.visual_craft ?? null
  const sectionDescriptions = analysis?.package?.section_descriptions ?? []
  const functionalityUi = useMemo(
    () =>
      (analysis?.items ?? [])
        .filter((item) => item.kind === 'ui_element')
        .map((item) => String(item.name || item.label || '').trim()),
    [analysis],
  )
  const functionalityPatterns = useMemo(
    () =>
      (analysis?.items ?? [])
        .filter((item) => item.kind === 'screen_pattern')
        .map((item) => String(item.name || item.label || '').trim()),
    [analysis],
  )
  const functionalityModules = analysis?.package?.vision_page?.notable_modules ?? []

  const sectionChapters = useMemo(() => {
    if (!overlays.length) return null
    return overlays.flatMap((hotspot) => {
      const look = sectionLooks.find(
        (item) => String(item.name ?? item.id ?? '') === hotspot.section_id,
      )
      const desc = sectionDescriptions.find((item) => item.section_id === hotspot.section_id)
      const atoms = sectionSpecAtoms(look, desc)
      if (!atoms.length) return []
      const crop = islandMediaUrl(look?.crop_url)
      return [
        <SpecAtomGrid
          key={hotspot.section_id}
          id={`dig-section-spec-${hotspot.section_id}`}
          title={hotspot.label || look?.category || paths.libraryCopy.screenInsightSectionSpec}
          kicker={paths.libraryCopy.screenInsightSectionSpecKicker}
          atoms={atoms}
          headingId={`dig-section-spec-${hotspot.section_id}`}
          lead={
            crop ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crop} alt="" className="dig-section-spec-thumb" loading="lazy" />
            ) : null
          }
        />,
      ]
    })
  }, [overlays, sectionLooks, sectionDescriptions])

  const accordionItems = useMemo(() => {
    if (!overlays.length) return []
    return overlays.map((hotspot) => {
      const look = sectionLooks.find(
        (item) => String(item.name ?? item.id ?? '') === hotspot.section_id,
      )
      const desc = sectionDescriptions.find((item) => item.section_id === hotspot.section_id)
      const atoms = sectionSpecAtoms(look, desc)
      const crop = islandMediaUrl(look?.crop_url)
      return {
        id: hotspot.section_id,
        title: hotspot.label || hotspot.section_id,
        preview: atoms[0]?.value.slice(0, 120) || undefined,
        panel: atoms.length ? (
          <SpecAtomGrid
            title={hotspot.label || paths.libraryCopy.screenInsightSectionSpec}
            atoms={atoms}
            headingId={`dig-side-spec-${hotspot.section_id}`}
            embedded
            lead={
              crop ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={crop} alt="" className="dig-section-look-thumb" loading="lazy" />
              ) : null
            }
          />
        ) : (
          <Text role="hint">
            {analysisPending
              ? 'Section spec appears after enrichment…'
              : 'No independent section spec yet.'}
          </Text>
        ),
      }
    })
  }, [overlays, sectionLooks, sectionDescriptions, analysisPending])

  return (
    <div className="dig-screen-detail">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Panel
        as="section"
        variant="editorial"
        className="dig-screen-magazine"
        aria-label={paths.libraryCopy.screenMagazineLabel}
      >
        <ScreenInsightStrip
          title={screen?.title || screen?.name || 'Screen'}
          url={screen?.canonical_url}
          facets={facets}
          pageArc={analysis?.package?.page_rhythm?.page_arc}
          pending={analysisPending}
          notes={layoutNotes}
        />
        <VisualCraftPanel craft={visualCraft} embedded />
        <UxAssessmentPanel page={analysis?.package?.vision_page} summary={summary} />
        <FunctionalityPanel
          ui={functionalityUi}
          patterns={functionalityPatterns}
          modules={functionalityModules}
        />
        {sectionChapters}
      </Panel>

      <ScreenDetailSplit
        media={
        <Panel className="dig-panel dig-screen-detail-media">
          {mediaUrl ? (
            <div className="dig-screen-detail-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt={screen?.title || screen?.name || 'Screenshot'}
                className="dig-screen-detail-image"
              />
              {overlays.length
                ? overlays.map((hotspot) => {
                    const box = hotspot.normalized
                    if (!box) return null
                    const active = openSectionId === hotspot.section_id
                    return (
                      <button
                        key={`${hotspot.section_id}-${hotspot.role}-${hotspot.label}`}
                        type="button"
                        className={`dig-section-overlay${active ? ' is-active' : ''}`}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`,
                        }}
                        title={hotspot.label}
                        onClick={() => selectSection(hotspot.section_id)}
                      >
                        <span>{hotspot.label}</span>
                      </button>
                    )
                  })
                : null}
            </div>
          ) : (
            <Text role="hint">No screenshot for this viewport.</Text>
          )}
          </Panel>
        }
        side={
          <Panel className="dig-panel dig-screen-detail-side">
          {summary ? (
            <details className="dig-screen-summary">
              <summary>{paths.libraryCopy.screenInsightSummary}</summary>
              <Text role="body">{summary}</Text>
            </details>
          ) : (
            <Text role="body">
              {analysisPending
                ? 'Waiting for enrichment / analysis…'
                : 'No analysis summary yet.'}
            </Text>
          )}
          {enrichmentHint ? <Text role="meta">{enrichmentHint}</Text> : null}

          <SectionChrome title={paths.libraryCopy.pageNarrativeLabel} as="h2" quiet />
          {pageNarrative.length ? (
            <ol className="dig-list">
              {pageNarrative.map((step, index) => (
                <li key={`${step.section_label ?? 'step'}-${index}`}>
                  <strong>{step.section_label ?? `Step ${index + 1}`}</strong>
                  {step.signature ? <Text role="meta">{step.signature}</Text> : null}
                </li>
              ))}
            </ol>
          ) : (
            <Text role="hint">
              {analysisPending
                ? 'Page narrative appears after enrichment finishes…'
                : 'No page narrative steps yet.'}
            </Text>
          )}

          <SectionChrome title={paths.libraryCopy.screenDetailSections} as="h2" quiet />
          {accordionItems.length ? (
            <Accordion
              aria-label={paths.libraryCopy.screenDetailSections}
              value={openSectionId}
              onChange={(sectionId) => {
                if (sectionId) selectSection(sectionId)
                else setOpenSectionId(null)
              }}
              items={accordionItems}
            />
          ) : (
            <Text role="hint">
              {analysisPending
                ? 'Section look still enriching…'
                : 'No section_look yet for this capture.'}
            </Text>
          )}
          </Panel>
        }
      />
    </div>
  )
}
