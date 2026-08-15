import type { EnrichmentJob, LibraryAnalysisDetail, LibraryAnalysisItem, LibraryAnalysisSummary } from "./api";

function confidenceLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return ` · ${(value * 100).toFixed(0)}%`;
}

function ItemList({ title, items, render }: { title: string; items: LibraryAnalysisItem[]; render: (item: LibraryAnalysisItem) => string }) {
  if (!items.length) return null;
  return (
    <div className="analysis-block">
      <h5>{title}</h5>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{render(item)}</strong>
            {item.interpretation ? <span>{item.interpretation}</span> : null}
            {item.signature ? <code>{item.signature}</code> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalysisResults({ detail }: { detail: LibraryAnalysisDetail | null }) {
  if (!detail) {
    return <p className="library-lede">No indexed LLM analysis for this capture yet.</p>;
  }
  const { analysis, items, package: pkg } = detail;
  const cost = pkg?.cost;
  const vision = pkg?.vision as { status?: string; summary?: string; labels?: Array<{ name?: string }> } | null | undefined;
  const sectionLooks = pkg?.section_descriptions ?? [];

  return (
    <div className="analysis-results">
      <p className="design-summary">{analysis.design_summary ?? "Analysis indexed without a summary."}</p>
      <dl className="result-grid compact">
        <dt>Status</dt>
        <dd>{analysis.status ?? "—"}</dd>
        <dt>Model</dt>
        <dd>{analysis.model ?? "—"}</dd>
        {typeof analysis.hypothesis_count === "number" ? (
          <>
            <dt>Hypotheses</dt>
            <dd>{analysis.hypothesis_count}</dd>
          </>
        ) : null}
        {cost && typeof cost.estimated_usd === "number" ? (
          <>
            <dt>Cost</dt>
            <dd>
              ~${cost.estimated_usd.toFixed(4)}
              {typeof cost.prompt_tokens === "number"
                ? ` · ${cost.prompt_tokens + (cost.completion_tokens ?? 0)} tok`
                : ""}
            </dd>
          </>
        ) : null}
        {vision?.status ? (
          <>
            <dt>Vision</dt>
            <dd>
              {vision.status}
              {vision.summary ? ` · ${vision.summary}` : ""}
            </dd>
          </>
        ) : null}
      </dl>
      {sectionLooks.length ? (
        <div className="analysis-block">
          <h5>Section look & feel</h5>
          <ul>
            {sectionLooks.map((item) => (
              <li key={item.section_id ?? item.signature ?? item.look_summary}>
                <strong>
                  {item.category ?? "section"}
                  {item.signature ? ` · ${item.signature}` : ""}
                  {confidenceLabel(item.confidence)}
                </strong>
                {item.stack_summary ? <span>{item.stack_summary}</span> : null}
                {item.look_summary ? <span>{item.look_summary}</span> : null}
                {item.interaction_summary ? <span>{item.interaction_summary}</span> : null}
                <span className="look-chips">
                  {[
                    item.background?.treatment ?? item.background?.kind,
                    item.overlay?.present ? item.overlay.kind ?? "overlay" : null,
                    item.shadows?.present ? item.shadows.notes ?? "shadow" : null,
                    item.alignment?.cta ? `cta:${item.alignment.cta}` : null,
                    ...(item.typography_emphasis ?? [])
                  ]
                    .filter(Boolean)
                    .map((chip) => (
                      <code key={String(chip)}>{chip}</code>
                    ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ItemList
          title="Section look & feel"
          items={items.section_look ?? []}
          render={(item) => `${item.category ?? item.name ?? "section"}${confidenceLabel(item.confidence)}`}
        />
      )}
      <ItemList
        title="Screen patterns"
        items={items.screen_patterns}
        render={(item) => `${item.name ?? "pattern"}${confidenceLabel(item.confidence)}`}
      />
      <ItemList
        title="UI elements"
        items={items.ui_elements}
        render={(item) => `${item.name ?? "element"}${confidenceLabel(item.confidence)}`}
      />
      <ItemList
        title="Recipe insights"
        items={items.recipe_insights}
        render={(item) => `${item.category ?? item.name ?? "recipe"}${confidenceLabel(item.confidence)}`}
      />
      <ItemList
        title="Visual style"
        items={items.visual_style}
        render={(item) => `${item.name ?? "style"}${confidenceLabel(item.confidence)}`}
      />
      <ItemList
        title="Page flow (LLM)"
        items={items.page_flow}
        render={(item) => item.section_label ?? `Step ${item.step_index ?? "?"}`}
      />
    </div>
  );
}

export function AnalysesPanel({
  analyses,
  selectedId,
  detail,
  error,
  onRefresh,
  onSelect
}: {
  analyses: LibraryAnalysisSummary[];
  selectedId: string | null;
  detail: LibraryAnalysisDetail | null;
  error: string | null;
  onRefresh: () => void;
  onSelect: (captureRunId: string) => void;
}) {
  return (
    <section className="library-panel ops-panel" aria-label="LLM analyses">
      <header className="status-header">
        <h2>Analyses</h2>
        <button type="button" className="ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <p className="library-lede">Indexed design AI results from completed enrichments.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="ops-split">
        <ul className="ops-list">
          {analyses.length === 0 ? (
            <li className="ops-empty">No analyses indexed yet.</li>
          ) : (
            analyses.slice(0, 24).map((row) => (
              <li key={row.capture_run_id}>
                <button
                  type="button"
                  className={`ghost ops-row ${selectedId === row.capture_run_id ? "active" : ""}`}
                  onClick={() => onSelect(row.capture_run_id)}
                >
                  <strong>{row.site_domain ?? row.capture_run_id}</strong>
                  <span>
                    {row.status ?? "—"}
                    {typeof row.hypothesis_count === "number" ? ` · ${row.hypothesis_count} hyp` : ""}
                    {row.model ? ` · ${row.model}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="ops-detail">
          {selectedId ? <AnalysisResults detail={detail} /> : <p className="library-lede">Select an analysis to inspect patterns, elements, and cost.</p>}
        </div>
      </div>
    </section>
  );
}

export function EnrichmentPanel({
  jobs,
  selectedId,
  error,
  onRefresh,
  onSelect,
  onOpenAnalysis
}: {
  jobs: EnrichmentJob[];
  selectedId: string | null;
  error: string | null;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onOpenAnalysis: (captureRunId: string) => void;
}) {
  const selected = jobs.find((job) => job.enrichment_job_id === selectedId) ?? null;
  return (
    <section className="library-panel ops-panel" aria-label="Enrichment queue">
      <header className="status-header">
        <h2>Enrichment</h2>
        <button type="button" className="ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>
      <p className="library-lede">Async LLM jobs — queue status, models, tokens, and estimated cost.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="ops-split">
        <ul className="ops-list">
          {jobs.length === 0 ? (
            <li className="ops-empty">No enrichment jobs yet.</li>
          ) : (
            jobs.slice(0, 24).map((job) => (
              <li key={job.enrichment_job_id}>
                <button
                  type="button"
                  className={`ghost ops-row ${selectedId === job.enrichment_job_id ? "active" : ""}`}
                  onClick={() => onSelect(job.enrichment_job_id)}
                >
                  <strong className={`status-pill status-${job.status}`}>{job.status}</strong>
                  <span>
                    {job.capture_run_id}
                    {typeof job.estimated_usd === "number" ? ` · ~$${job.estimated_usd.toFixed(4)}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="ops-detail">
          {selected ? (
            <>
              <p className="status-message">{selected.message}</p>
              <dl className="result-grid compact">
                <dt>Job</dt>
                <dd>{selected.enrichment_job_id}</dd>
                <dt>Capture</dt>
                <dd>{selected.capture_run_id}</dd>
                <dt>Bulk</dt>
                <dd>{selected.bulk_model ?? "—"}</dd>
                <dt>Quality</dt>
                <dd>{selected.quality_model ?? "—"}</dd>
                {typeof selected.hypothesis_count === "number" ? (
                  <>
                    <dt>Hypotheses</dt>
                    <dd>{selected.hypothesis_count}</dd>
                  </>
                ) : null}
                {selected.vision_status ? (
                  <>
                    <dt>Vision</dt>
                    <dd>{selected.vision_status}</dd>
                  </>
                ) : null}
                {typeof selected.prompt_tokens === "number" ? (
                  <>
                    <dt>Tokens</dt>
                    <dd>
                      {selected.prompt_tokens}+{selected.completion_tokens ?? 0}
                    </dd>
                  </>
                ) : null}
                {typeof selected.estimated_usd === "number" ? (
                  <>
                    <dt>Est. USD</dt>
                    <dd>~${selected.estimated_usd.toFixed(4)}</dd>
                  </>
                ) : null}
              </dl>
              {selected.design_summary ? <p className="design-summary">{selected.design_summary}</p> : null}
              {selected.error ? <p className="error">{selected.error}</p> : null}
              <button type="button" className="cta secondary" onClick={() => onOpenAnalysis(selected.capture_run_id)}>
                Open analysis
              </button>
            </>
          ) : (
            <p className="library-lede">Select a job for detail.</p>
          )}
        </div>
      </div>
    </section>
  );
}
