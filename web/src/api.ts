import { API_ENRICHMENT_PATH, API_JOBS_PATH, API_LIBRARY_PATH } from "./dig-config";
import type { JobEvent, JobSnapshot } from "./stages";

export async function startJob(url: string): Promise<JobSnapshot> {
  const response = await fetch(API_JOBS_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url })
  });
  const body = (await response.json()) as JobSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export async function fetchJob(jobId: string): Promise<JobSnapshot> {
  const response = await fetch(`${API_JOBS_PATH}/${encodeURIComponent(jobId)}`);
  const body = (await response.json()) as JobSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function subscribeJobEvents(jobId: string, onEvent: (event: JobEvent) => void): () => void {
  const source = new EventSource(`${API_JOBS_PATH}/${encodeURIComponent(jobId)}/events`);
  const handle = (message: MessageEvent<string>) => {
    onEvent(JSON.parse(message.data) as JobEvent);
  };
  source.addEventListener("job", handle as EventListener);
  source.onerror = () => {
    // Browser reconnects automatically until the server closes the stream.
  };
  return () => {
    source.removeEventListener("job", handle as EventListener);
    source.close();
  };
}

export interface EnrichmentJob {
  enrichment_job_id: string;
  capture_job_id?: string;
  capture_run_id: string;
  package_path: string;
  status: string;
  message: string;
  attempts: number;
  max_attempts: number;
  bulk_model?: string;
  quality_model?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  llm_status?: string;
  hypothesis_count?: number;
  design_summary?: string;
  vision_status?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  estimated_usd?: number | null;
}

export async function fetchEnrichmentJobs(): Promise<EnrichmentJob[]> {
  const response = await fetch(API_ENRICHMENT_PATH);
  const body = (await response.json()) as { jobs?: EnrichmentJob[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Enrichment list failed (${response.status})`);
  return body.jobs ?? [];
}

export async function fetchEnrichmentJob(id: string): Promise<EnrichmentJob> {
  const response = await fetch(`${API_ENRICHMENT_PATH}/${encodeURIComponent(id)}`);
  const body = (await response.json()) as EnrichmentJob & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Enrichment job failed (${response.status})`);
  return body;
}

export interface LibraryScreen {
  capture_run_id: string;
  viewport_capture_id: string;
  name: string;
  title: string | null;
  site_domain: string | null;
  canonical_url: string;
  settled_url: string | null;
  width: number | null;
  height: number | null;
}

export interface LibrarySection {
  capture_run_id: string;
  viewport_name: string;
  taxonomy_id: string;
  category: string;
  signature: string;
  confidence: number;
  text_signals: string[];
}

export interface HotspotBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LibraryHotspot {
  section_id: string;
  label: string;
  role: string;
  box: HotspotBox;
  normalized: HotspotBox | null;
}

export interface LibraryFlowStep {
  section_label: string | null;
  signature: string | null;
  step_index: number | null;
  matched_section: {
    section_id: string;
    category: string;
    signature: string;
  } | null;
}

export interface LibraryCollection {
  id: string;
  name: string;
  created_at?: string;
  capture_count?: number;
}

export interface LibraryAnalysisSummary {
  capture_run_id: string;
  model: string | null;
  status: string | null;
  analysis_mode: string | null;
  design_summary: string | null;
  hypothesis_count: number | null;
  generated_at: string | null;
  site_domain: string | null;
  canonical_url: string | null;
}

export interface LibraryAnalysisItem {
  id: number;
  kind: string;
  name: string | null;
  signature: string | null;
  category: string | null;
  interpretation: string | null;
  section_label: string | null;
  step_index: number | null;
  confidence: number | null;
  evidence_refs: unknown;
  gaps: unknown;
}

export interface LibraryAnalysisDetail {
  analysis: LibraryAnalysisSummary & {
    base_url?: string | null;
    raw_response_sha256?: string | null;
    package_path?: string | null;
  };
  items: {
    screen_patterns: LibraryAnalysisItem[];
    ui_elements: LibraryAnalysisItem[];
    recipe_insights: LibraryAnalysisItem[];
    page_flow: LibraryAnalysisItem[];
    visual_style: LibraryAnalysisItem[];
  };
  package: {
    vision?: unknown;
    cost?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      estimated_usd?: number | null;
    } | null;
    stages?: unknown;
    hypotheses?: unknown;
  } | null;
}

export async function fetchLibraryScreens(): Promise<LibraryScreen[]> {
  const response = await fetch(`${API_LIBRARY_PATH}/screens`);
  const body = (await response.json()) as { screens?: LibraryScreen[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Library screens failed (${response.status})`);
  return body.screens ?? [];
}

export async function fetchLibrarySections(filters: {
  category?: string;
  signature?: string;
  q?: string;
}): Promise<LibrarySection[]> {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.signature) params.set("signature", filters.signature);
  if (filters.q) params.set("q", filters.q);
  const response = await fetch(`${API_LIBRARY_PATH}/sections?${params.toString()}`);
  const body = (await response.json()) as { sections?: LibrarySection[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Library sections failed (${response.status})`);
  return body.sections ?? [];
}

export async function fetchScreenDetail(viewportCaptureId: string): Promise<{
  screen: LibraryScreen;
  hotspots: LibraryHotspot[];
}> {
  const response = await fetch(`${API_LIBRARY_PATH}/screens/${encodeURIComponent(viewportCaptureId)}`);
  const body = (await response.json()) as {
    screen?: LibraryScreen;
    hotspots?: LibraryHotspot[];
    error?: string;
  };
  if (!response.ok) throw new Error(body.error ?? `Screen detail failed (${response.status})`);
  return { screen: body.screen!, hotspots: body.hotspots ?? [] };
}

export async function fetchLibraryFlows(captureRunId: string): Promise<LibraryFlowStep[]> {
  const response = await fetch(
    `${API_LIBRARY_PATH}/flows?capture_run_id=${encodeURIComponent(captureRunId)}`
  );
  const body = (await response.json()) as { steps?: LibraryFlowStep[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Flows failed (${response.status})`);
  return body.steps ?? [];
}

export async function fetchAnalyses(): Promise<LibraryAnalysisSummary[]> {
  const response = await fetch(`${API_LIBRARY_PATH}/analyses`);
  const body = (await response.json()) as { analyses?: LibraryAnalysisSummary[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Analyses failed (${response.status})`);
  return body.analyses ?? [];
}

export async function fetchAnalysisDetail(captureRunId: string): Promise<LibraryAnalysisDetail> {
  const response = await fetch(`${API_LIBRARY_PATH}/analyses/${encodeURIComponent(captureRunId)}`);
  const body = (await response.json()) as LibraryAnalysisDetail & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Analysis detail failed (${response.status})`);
  return body;
}

export async function fetchCollections(): Promise<LibraryCollection[]> {
  const response = await fetch(`${API_LIBRARY_PATH}/collections`);
  const body = (await response.json()) as { collections?: LibraryCollection[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Collections failed (${response.status})`);
  return body.collections ?? [];
}

export async function createCollection(name: string): Promise<LibraryCollection> {
  const response = await fetch(`${API_LIBRARY_PATH}/collections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name })
  });
  const body = (await response.json()) as LibraryCollection & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Create collection failed (${response.status})`);
  return body;
}

export async function addCaptureToCollection(collectionId: string, captureRunId: string): Promise<void> {
  const response = await fetch(`${API_LIBRARY_PATH}/collections/${encodeURIComponent(collectionId)}/captures`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capture_run_id: captureRunId })
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? `Add to collection failed (${response.status})`);
  }
}

export interface LibrarySearchHit {
  capture_run_id: string;
  subject_kind: string;
  subject_id: string;
  content_text: string;
  site_domain: string | null;
  canonical_url: string;
  score: number;
}

export async function searchLibrary(query: string): Promise<LibrarySearchHit[]> {
  const response = await fetch(`${API_LIBRARY_PATH}/search?q=${encodeURIComponent(query)}`);
  const body = (await response.json()) as { results?: LibrarySearchHit[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Search failed (${response.status})`);
  return body.results ?? [];
}

export function figmaExportUrl(captureRunId: string): string {
  return `${API_LIBRARY_PATH}/export/figma?capture_run_id=${encodeURIComponent(captureRunId)}`;
}
