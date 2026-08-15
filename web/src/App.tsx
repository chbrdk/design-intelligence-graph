import { useEffect, useState, type FormEvent } from "react";
import {
  addCaptureToCollection,
  createCollection,
  fetchCollections,
  fetchJob,
  fetchLibraryFlows,
  fetchLibraryScreens,
  fetchLibrarySections,
  fetchScreenDetail,
  figmaExportUrl,
  searchLibrary,
  startJob,
  subscribeJobEvents,
  type LibraryCollection,
  type LibraryFlowStep,
  type LibraryHotspot,
  type LibraryScreen,
  type LibrarySearchHit,
  type LibrarySection
} from "./api";
import { STAGE_ORDER, stageLabel, stagePhase, type JobEvent, type JobSnapshot, type JobStage } from "./stages";

const ACTIVE: JobStage[] = ["queued", "capturing", "analyzing", "verifying", "indexing"];

export function App() {
  const [url, setUrl] = useState("https://example.com");
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [screens, setScreens] = useState<LibraryScreen[]>([]);
  const [sections, setSections] = useState<LibrarySection[]>([]);
  const [category, setCategory] = useState("");
  const [signature, setSignature] = useState("");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedScreen, setSelectedScreen] = useState<LibraryScreen | null>(null);
  const [hotspots, setHotspots] = useState<LibraryHotspot[]>([]);
  const [flowSteps, setFlowSteps] = useState<LibraryFlowStep[]>([]);
  const [collections, setCollections] = useState<LibraryCollection[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<LibrarySearchHit[]>([]);

  async function refreshLibrary(nextCategory = category, nextSignature = signature) {
    try {
      setLibraryError(null);
      const [nextScreens, nextSections, nextCollections] = await Promise.all([
        fetchLibraryScreens(),
        fetchLibrarySections({
          ...(nextCategory ? { category: nextCategory } : {}),
          ...(nextSignature ? { signature: nextSignature } : {})
        }),
        fetchCollections().catch(() => [] as LibraryCollection[])
      ]);
      setScreens(nextScreens);
      setSections(nextSections);
      setCollections(nextCollections);
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : String(err));
      setScreens([]);
      setSections([]);
    }
  }

  async function openScreen(screen: LibraryScreen) {
    try {
      setLibraryError(null);
      const detail = await fetchScreenDetail(screen.viewport_capture_id);
      setSelectedScreen(detail.screen);
      setHotspots(detail.hotspots.filter((item) => item.role === "section" || item.normalized));
      setFlowSteps(await fetchLibraryFlows(screen.capture_run_id));
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onCreateCollection() {
    const name = collectionName.trim();
    if (!name) return;
    try {
      await createCollection(name);
      setCollectionName("");
      setCollections(await fetchCollections());
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onAddSelectedToCollection(collectionId: string) {
    if (!selectedScreen) return;
    try {
      await addCaptureToCollection(collectionId, selectedScreen.capture_run_id);
      setCollections(await fetchCollections());
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSearch() {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    try {
      setLibraryError(null);
      setSearchHits(await searchLibrary(q));
    } catch (err: unknown) {
      setLibraryError(err instanceof Error ? err.message : String(err));
      setSearchHits([]);
    }
  }

  async function openHit(hit: LibrarySearchHit) {
    const match = screens.find((screen) => screen.capture_run_id === hit.capture_run_id);
    if (match) {
      await openScreen(match);
      return;
    }
    const related = screens.filter((screen) => screen.capture_run_id === hit.capture_run_id);
    if (related[0]) await openScreen(related[0]);
  }

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (!job || !ACTIVE.includes(job.stage)) return;
    return subscribeJobEvents(job.job_id, (event) => {
      setEvents((prev) => {
        if (prev.some((item) => item.at === event.at && item.stage === event.stage && item.message === event.message)) {
          return prev;
        }
        return [...prev, event];
      });
      setJob((prev) =>
        prev
          ? {
              ...prev,
              stage: event.stage,
              message: event.message,
              updated_at: event.at,
              ...(event.result ? { result: event.result } : {}),
              ...(event.error ? { error: event.error } : {})
            }
          : prev
      );
      if (event.stage === "complete") void refreshLibrary();
    });
  }, [job?.job_id, job?.stage]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    setEvents([]);
    try {
      const created = await startJob(url);
      setJob(created);
      const snapshot = await fetchJob(created.job_id);
      setJob(snapshot);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setJob(null);
    } finally {
      setSubmitting(false);
    }
  }

  const phase = job ? stagePhase(job.stage) : "idle";
  const currentIndex = job ? STAGE_ORDER.indexOf(job.stage === "failed" ? "queued" : job.stage) : -1;

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true" />
      <main className="composition">
        <p className="brand">DIG</p>
        <h1 className="headline">Capture a design surface.</h1>
        <p className="lede">
          Enter a public URL. DIG measures viewports, derives section recipes, and indexes a browsable library.
        </p>

        <form className="capture-form" onSubmit={onSubmit}>
          <label className="url-label" htmlFor="url">
            Target URL
          </label>
          <div className="url-row">
            <input
              id="url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              value={url}
              onChange={(change) => setUrl(change.target.value)}
              required
            />
            <button type="submit" className="cta" disabled={submitting || (job !== null && ACTIVE.includes(job.stage))}>
              {submitting ? "Starting…" : job && ACTIVE.includes(job.stage) ? "Running…" : "Run capture"}
            </button>
          </div>
        </form>

        {error ? <p className="error" role="alert">{error}</p> : null}

        <section className={`status-panel phase-${phase}`} aria-live="polite">
          <header className="status-header">
            <h2>Pipeline status</h2>
            {job ? <span className="job-id">{job.job_id}</span> : <span className="job-id">Idle</span>}
          </header>

          <ol className="timeline">
            {STAGE_ORDER.map((stage, index) => {
              const state =
                job?.stage === "failed" && index === 0
                  ? "failed"
                  : currentIndex > index
                    ? "done"
                    : currentIndex === index
                      ? job?.stage === "complete"
                        ? "done"
                        : "active"
                      : "pending";
              return (
                <li key={stage} className={`step step-${state}`}>
                  <span className="step-dot" />
                  <div className="step-copy">
                    <strong>{stageLabel(stage)}</strong>
                    <span>
                      {stage === "capturing"
                        ? "Detection · measure viewports"
                        : stage === "analyzing"
                          ? "Design AI · staged Gemma"
                          : stage === "verifying"
                          ? "Ingestion · integrity check"
                          : stage === "indexing"
                            ? "Ingestion · graph + library"
                            : stage === "complete"
                              ? "Ready to browse"
                              : "Waiting"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="status-message">{job?.message ?? "Paste a URL to begin."}</p>
          {job?.result?.design_summary ? <p className="design-summary">{job.result.design_summary}</p> : null}
          {job?.error ? <p className="error">{job.error}</p> : null}

          {job?.result ? (
            <dl className="result-grid">
              {job.result.capture_run_id ? (
                <>
                  <dt>Capture</dt>
                  <dd>{job.result.capture_run_id}</dd>
                </>
              ) : null}
              {job.result.llm_status ? (
                <>
                  <dt>Design AI</dt>
                  <dd>
                    {job.result.llm_status}
                    {typeof job.result.llm_hypothesis_count === "number"
                      ? ` · ${job.result.llm_hypothesis_count} hypotheses`
                      : ""}
                  </dd>
                </>
              ) : null}
              {typeof job.result.checked_artifacts === "number" ? (
                <>
                  <dt>Artifacts</dt>
                  <dd>{job.result.checked_artifacts}</dd>
                </>
              ) : null}
              {typeof job.result.nodes === "number" ? (
                <>
                  <dt>Graph</dt>
                  <dd>
                    {job.result.nodes} nodes · {job.result.edges ?? 0} edges
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {events.length > 0 ? (
            <ul className="event-log">
              {events.slice(-6).map((event) => (
                <li key={`${event.at}-${event.stage}-${event.message}`}>
                  <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
                  <span>{event.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="library-panel" aria-label="Design library">
          <header className="status-header">
            <h2>Library</h2>
            <button type="button" className="ghost" onClick={() => void refreshLibrary()}>
              Refresh
            </button>
          </header>
          <p className="library-lede">Browse screens, section recipes, and page flows. Semantic search uses local hashing embeddings.</p>
          <div className="library-filters search-row">
            <label>
              Semantic search
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="hero media cta"
              />
            </label>
            <button type="button" className="cta secondary" onClick={() => void onSearch()}>
              Search
            </button>
          </div>
          {searchHits.length ? (
            <ul className="search-hits">
              {searchHits.slice(0, 12).map((hit) => (
                <li key={`${hit.capture_run_id}-${hit.subject_kind}-${hit.subject_id}`}>
                  <button type="button" className="ghost" onClick={() => void openHit(hit)}>
                    <strong>{hit.site_domain ?? hit.capture_run_id}</strong>
                    <span>
                      {hit.subject_kind} · {hit.content_text.slice(0, 80)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="library-filters">
            <label>
              Category
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="hero"
              />
            </label>
            <label>
              Signature
              <input
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                placeholder="media>heading>cta"
              />
            </label>
            <button
              type="button"
              className="cta secondary"
              onClick={() => void refreshLibrary(category, signature)}
            >
              Filter
            </button>
          </div>
          {libraryError ? <p className="error">{libraryError}</p> : null}
          <div className="screen-grid">
            {screens.slice(0, 12).map((screen) => (
              <button
                type="button"
                key={`${screen.capture_run_id}-${screen.viewport_capture_id}`}
                className="screen-card"
                onClick={() => void openScreen(screen)}
              >
                {screen.settled_url ? (
                  <img src={screen.settled_url} alt={`${screen.site_domain ?? "site"} ${screen.name}`} loading="lazy" />
                ) : (
                  <div className="screen-fallback">{screen.name}</div>
                )}
                <div className="screen-meta">
                  <strong>{screen.site_domain ?? "unknown"}</strong>
                  <span>
                    {screen.name}
                    {screen.width && screen.height ? ` · ${screen.width}×${screen.height}` : ""}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {selectedScreen ? (
            <div className="screen-detail">
              <header className="status-header">
                <h3>
                  {selectedScreen.site_domain ?? "screen"} · {selectedScreen.name}
                </h3>
                <button type="button" className="ghost" onClick={() => setSelectedScreen(null)}>
                  Close
                </button>
              </header>
              <div className="screen-detail-layout">
                <div className="hotspot-stage">
                  {selectedScreen.settled_url ? (
                    <img src={selectedScreen.settled_url} alt="" />
                  ) : (
                    <div className="screen-fallback">No screenshot</div>
                  )}
                  {hotspots.map((hotspot, index) => {
                    const box = hotspot.normalized;
                    if (!box) return null;
                    return (
                      <span
                        key={`${hotspot.section_id}-${hotspot.role}-${index}`}
                        className={`hotspot role-${hotspot.role}`}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`
                        }}
                        title={hotspot.label}
                      />
                    );
                  })}
                </div>
                <div className="flow-panel">
                  <h4>Page flow</h4>
                  {flowSteps.length ? (
                    <ol className="flow-list">
                      {flowSteps.map((step, index) => (
                        <li key={`${step.step_index ?? index}-${step.section_label}`}>
                          <strong>{step.section_label ?? `Step ${index + 1}`}</strong>
                          <code>{step.signature ?? "—"}</code>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="library-lede">No flow steps yet for this capture.</p>
                  )}
                  <a className="ghost download-link" href={figmaExportUrl(selectedScreen.capture_run_id)} download>
                    Download Figma export JSON
                  </a>
                  <h4>Collections</h4>
                  <div className="collection-row">
                    <input
                      value={collectionName}
                      onChange={(event) => setCollectionName(event.target.value)}
                      placeholder="New collection"
                    />
                    <button type="button" className="cta secondary" onClick={() => void onCreateCollection()}>
                      Add
                    </button>
                  </div>
                  <ul className="collection-list">
                    {collections.map((collection) => (
                      <li key={collection.id}>
                        <span>
                          {collection.name}
                          {typeof collection.capture_count === "number" ? ` · ${collection.capture_count}` : ""}
                        </span>
                        <button type="button" className="ghost" onClick={() => void onAddSelectedToCollection(collection.id)}>
                          Save screen
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <ul className="section-list">
            {sections.slice(0, 20).map((section) => (
              <li key={`${section.capture_run_id}-${section.signature}-${section.taxonomy_id}-${section.viewport_name}`}>
                <strong>{section.category}</strong>
                <code>{section.signature}</code>
                <span>{section.taxonomy_id}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
