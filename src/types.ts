export type CaptureStatus =
  | "complete"
  | "partial"
  | "failed"
  | "not_attempted"
  | "unsupported"
  | "blocked";

export interface ViewportDefinition {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface CaptureOptions {
  url: string;
  outputDirectory: string;
  viewports: ViewportDefinition[];
  timeoutMs: number;
  settleMs: number;
  locale: string;
  timezoneId: string;
  colorScheme: "light" | "dark";
  reducedMotion: "reduce" | "no-preference";
  headed: boolean;
}

export interface ArtifactReference {
  path: string;
  sha256: string;
  bytes: number;
  media_type: string;
}

export interface BrowserDetails {
  engine: "chromium";
  version: string;
  user_agent: string;
  locale: string;
  timezone: string;
}

export interface ViewportResult {
  viewport_capture_id: string;
  name: string;
  viewport: { width: number; height: number; device_scale_factor: number };
  document: { width: number; height: number };
  final_url: string;
  title: string;
  started_at: string;
  completed_at: string;
  status: CaptureStatus;
  node_count: number;
  visible_node_count: number;
  text_line_count: number;
  artifacts: Record<string, ArtifactReference>;
  warnings: string[];
  quality: import("./quality.js").QualityEvaluation;
}

export interface CaptureManifest {
  schema_version: "0.1.0";
  capture_run_id: string;
  started_at: string;
  completed_at: string;
  requested_url: string;
  canonical_url: string;
  site: { site_id: string; domain: string; scheme: string; canonical_origin: string };
  page: { page_id: string; site_id: string; url: string; canonical_url: string; route: string };
  crawler: { name: "dig-capture"; version: string };
  browser: BrowserDetails;
  environment: {
    prefers_color_scheme: "light" | "dark";
    prefers_reduced_motion: boolean;
    forced_colors: false;
    touch: false;
    pointer: "fine";
    hover: true;
  };
  capture_dimensions: {
    locale: string;
    market: "unknown";
    theme: "light" | "dark";
    consent_state: "unknown";
    authentication_state: "unauthenticated";
    personalization: "unknown";
    experiments: string[];
  };
  policy: {
    authorization_basis: "user_initiated_public_capture";
    robots_decision: "not_evaluated_interactive_capture";
    retention_class: "unspecified";
    redistribution_class: "structural_evidence_only";
  };
  status: CaptureStatus;
  capture_status: Record<string, CaptureStatus>;
  run_artifacts: Record<string, ArtifactReference>;
  viewport_captures: ViewportResult[];
  interventions: string[];
  errors: Array<{ viewport?: string; code: string; message: string }>;
}
