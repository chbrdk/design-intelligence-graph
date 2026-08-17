import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DigPaths {
  docker: {
    image: string;
    playwrightBaseImage: string;
    composeService: string;
    composeWebService: string;
    capturesHostDir: string;
    capturesContainerDir: string;
    indexesHostDir: string;
    indexesContainerDir: string;
    hostFromContainer: string;
    webHostPort: number;
    webContainerPort: number;
  };
  web: {
    port: number;
    host: string;
    staticDir: string;
    viteDevPort: number;
  };
  api: {
    basePath: string;
    jobsPath: string;
    libraryPath?: string;
    enrichmentPath?: string;
    mcpPath?: string;
  };
  runtime: {
    capturesDir: string;
    indexesDir: string;
    containerCapturesDir: string;
    containerIndexesDir: string;
  };
  captureNav?: {
    doc?: string;
    challengeWaitMs?: number;
    maxRetries?: number;
    retryBaseMs?: number;
    jobTimeoutMs?: number;
    firefoxFallbackViewport?: string;
    libraryListedStatuses?: string[];
  };
  captureLimits?: {
    maxHtmlBytes?: number;
    screenshotFormat?: string;
    webpQuality?: number;
    [key: string]: unknown;
  };
  chromeStates?: {
    maxOpens?: number;
    doc?: string;
    kinds?: string[];
  };
  designTokens?: {
    relativePath?: string;
    maxColors?: number;
    maxTypeStyles?: number;
    doc?: string;
  };
  lookContract?: {
    version?: string;
    doc?: string;
    sourceTokensRelativePath?: string;
    facetsVersion?: string;
    generateConstraintCap?: number;
    generationVersion?: string;
    capturePromptPackPath?: string;
  };
  libraryScreenFacets?: {
    queryStyle?: string;
    queryLayout?: string;
    queryIndustry?: string;
    doc?: string;
  };
  mcpLibraryTools?: {
    screenSearch?: string;
    capturePromptPack?: string;
    defaultLimit?: number;
    listLimit?: number;
    doc?: string;
  };
  mcpSpirion?: {
    prefix?: string;
    serverName?: string;
    doc?: string;
    schema?: string;
    tools?: string[];
  };
  structureSpine?: {
    relativePath?: string;
    maxBands?: number;
    doc?: string;
  };
  pageRhythm?: {
    version?: string;
    doc?: string;
    maxBands?: number;
    generationVersion?: string;
  };
  flowCandidates?: {
    relativePath?: string;
    maxCandidates?: number;
    doc?: string;
  };
  flowEdges?: {
    relativePath?: string;
    jsonlRelativePath?: string;
    localJsonlRelativePath?: string;
    maxSiblingPackages?: number;
    doc?: string;
  };
  flowActionsDetect?: {
    relativePath?: string;
    doc?: string;
  };
  flowGraph?: {
    relativePath?: string;
    doc?: string;
  };
  flowLibrary?: {
    graphsRelativeDir?: string;
    includeFixturesWhenEmpty?: boolean;
    doc?: string;
  };
  database?: {
    composeService: string;
    image: string;
    hostPort: number;
    containerPort: number;
    database: string;
    user: string;
    passwordEnv: string;
    defaultPassword: string;
    urlEnv: string;
    defaultUrl: string;
    urlFromContainer: string;
    migrationsDir: string;
  };
  embeddings?: {
    dims: number;
    model: string;
    provider: string;
  };
  llm: {
    enabledDefault: boolean;
    defaultBaseUrl: string;
    baseUrlFromContainer: string;
    defaultModel: string;
    modelId: string;
    serverHost: string;
    serverPort: number;
    pythonCandidates: string[];
    timeoutMs: number;
    stagedAnalysis?: boolean;
    stageMaxTokens?: number;
    parityTarget?: string;
    providerDefault?: "local" | "openrouter";
    fallbackProvider?: "local" | "openrouter" | "";
    openrouter?: {
      baseUrl: string;
      defaultModel: string;
      visionModel?: string;
      apiKeyEnv: string;
      httpReferer?: string;
      appTitle?: string;
    };
    qualityEval?: {
      scenarioDefault?: string;
      scenariosDir?: string;
      reportDir?: string;
      models?: Array<{
        id: string;
        label: string;
        tracks: Array<"text" | "vision">;
        text_model?: string;
        vision_model?: string;
      }>;
    };
    scaling?: {
      target?: string;
      callsPerCaptureEstimate?: Record<string, number>;
      roles?: {
        bulkText?: string;
        bulkVision?: string;
        qualityText?: string;
        qualityVision?: string;
        freeDevText?: string;
        freeDevVision?: string;
      };
      bulkReasoningEffort?: "none" | "low" | "medium" | "high" | "max";
      confidenceEscalateBelow?: number;
      asyncDefault?: boolean;
      sectionLookMaxSections?: number;
      sectionLookMaxTokens?: number;
      visionMaxBytes?: number;
      sectionVisionMaxPerCapture?: number;
      doc?: string;
    };
  };
  plexon?: {
    digApiUrlEnv?: string;
    spirionApiUrlEnv?: string;
    digApiTokenEnv?: string;
    defaultDigApiUrl?: string;
    platformProjectQueryParam?: string;
  };
  coolify?: {
    digApiFqdn?: string;
    digFqdn?: string;
  };
  cursorMcp?: {
    serverName?: string;
    configPath?: string;
    graphRelativePath?: string;
    preferStagingApi?: boolean;
    httpPath?: string;
    httpClientEnv?: string;
    doc?: string;
  };
}

let cached: DigPaths | undefined;

export function loadDigPaths(root = process.cwd()): DigPaths {
  if (cached) return cached;
  const raw = readFileSync(resolve(root, "knowledge/paths.json"), "utf8");
  cached = JSON.parse(raw) as DigPaths;
  return cached;
}

export function capturesDirectory(root = process.cwd()): string {
  const paths = loadDigPaths(root);
  if (process.env.DIG_CAPTURES_DIR) return resolve(process.env.DIG_CAPTURES_DIR);
  if (process.env.DIG_IN_CONTAINER === "1") return paths.runtime.containerCapturesDir;
  return resolve(root, paths.runtime.capturesDir);
}

export function indexesDirectory(root = process.cwd()): string {
  const paths = loadDigPaths(root);
  if (process.env.DIG_INDEXES_DIR) return resolve(process.env.DIG_INDEXES_DIR);
  if (process.env.DIG_IN_CONTAINER === "1") return paths.runtime.containerIndexesDir;
  return resolve(root, paths.runtime.indexesDir);
}

export function webPort(): number {
  const fromEnv = Number(process.env.DIG_WEB_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return loadDigPaths().web.port;
}

export function webHost(): string {
  return process.env.DIG_WEB_HOST ?? loadDigPaths().web.host;
}

export function webStaticDir(root = process.cwd()): string {
  return resolve(root, process.env.DIG_WEB_STATIC_DIR ?? loadDigPaths().web.staticDir);
}

export function databaseUrl(environment: NodeJS.ProcessEnv = process.env, root = process.cwd()): string | null {
  const paths = loadDigPaths(root);
  const db = paths.database;
  if (!db) return null;
  if (environment[db.urlEnv]) return environment[db.urlEnv]!;
  if (environment.DIG_IN_CONTAINER === "1") return db.urlFromContainer;
  return db.defaultUrl;
}

export function libraryApiPath(): string {
  return loadDigPaths().api.libraryPath ?? "/api/library";
}

export function libraryScreenFacetQueryKeys(root = process.cwd()): {
  style: string;
  layout: string;
  industry: string;
} {
  const cfg = loadDigPaths(root).libraryScreenFacets;
  return {
    style: cfg?.queryStyle ?? "style",
    layout: cfg?.queryLayout ?? "layout",
    industry: cfg?.queryIndustry ?? "industry"
  };
}

export function mcpLibraryToolNames(root = process.cwd()): {
  screenSearch: string;
  capturePromptPack: string;
} {
  const cfg = loadDigPaths(root).mcpLibraryTools;
  return {
    screenSearch: cfg?.screenSearch ?? "dig_screen_search",
    capturePromptPack: cfg?.capturePromptPack ?? "dig_capture_prompt_pack"
  };
}

export function digApiBaseUrl(root = process.cwd(), environment: NodeJS.ProcessEnv = process.env): string | null {
  const paths = loadDigPaths(root);
  const envName = paths.plexon?.digApiUrlEnv ?? "DIG_API_URL";
  const altName = paths.plexon?.spirionApiUrlEnv ?? "SPIRION_API_URL";
  const fromEnv = environment[envName]?.trim() || environment[altName]?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return null;
}

export function mcpHttpPath(root = process.cwd()): string {
  const paths = loadDigPaths(root);
  return paths.cursorMcp?.httpPath ?? paths.api.mcpPath ?? "/mcp";
}

export function cursorMcpRemoteUrl(root = process.cwd()): string {
  const paths = loadDigPaths(root);
  const base = (paths.coolify?.digApiFqdn ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  return `${base}${mcpHttpPath(root)}`;
}

export function mcpHttpClientEnabled(environment: NodeJS.ProcessEnv = process.env, root = process.cwd()): boolean {
  const envName = loadDigPaths(root).cursorMcp?.httpClientEnv ?? "DIG_MCP_HTTP_CLIENT";
  const value = environment[envName]?.trim();
  return value === "1" || value === "true";
}

export function applyCursorMcpDefaults(root = process.cwd(), environment: NodeJS.ProcessEnv = process.env): string {
  const paths = loadDigPaths(root);
  const envName = paths.plexon?.digApiUrlEnv ?? "DIG_API_URL";
  const clientEnv = paths.cursorMcp?.httpClientEnv ?? "DIG_MCP_HTTP_CLIENT";
  if (!environment[envName]?.trim() && paths.cursorMcp?.preferStagingApi && paths.coolify?.digApiFqdn) {
    environment[envName] = paths.coolify.digApiFqdn;
  }
  if (!environment[clientEnv]?.trim()) environment[clientEnv] = "1";
  return resolve(root, paths.cursorMcp?.graphRelativePath ?? "fixtures/mcp/empty-graph.json");
}
