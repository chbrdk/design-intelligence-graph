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
    embeddingsPath?: string;
    mcpPath?: string;
    pinterestPath?: string;
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
    geolocation?: { latitude: number; longitude: number };
    acceptHeader?: string;
    secChUaTemplate?: string;
    chromiumUserAgentTemplates?: {
      linux?: string;
      darwin?: string;
      win32?: string;
    };
    secChUaPlatform?: {
      linux?: string;
      darwin?: string;
      win32?: string;
    };
  };
  captureSettle?: {
    doc?: string;
    settleMs?: number;
    initialWaitMs?: number;
    postScrollQuietMs?: number;
    scrollStepPx?: number;
    scrollMaxPx?: number;
    scrollPauseMs?: number;
  };
  captureLimits?: {
    maxHtmlBytes?: number;
    screenshotFormat?: string;
    webpQuality?: number;
    [key: string]: unknown;
  };
  cookieConsent?: {
    doc?: string;
    source?: string;
    retries?: number;
    retryDelayMs?: number;
    postDismissWaitMs?: number;
    checkionFullPageSuffix?: string;
    playwrightFullPageStem?: string;
    iframeUrlPattern?: string;
    preScreenshotRetries?: number;
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
    composeBriefPath?: string;
  };
  northlineRebuild?: {
    doc?: string;
    route?: string;
    heroImage?: string;
    captureRunId?: string;
    viewportCaptureId?: string;
    sourceScreenHash?: string;
  };
  libraryScreenFacets?: {
    queryStyle?: string;
    queryLayout?: string;
    queryIndustry?: string;
    pollMs?: number;
    doc?: string;
  };
  libraryScreenGallery?: {
    doc?: string;
    primaryViewport?: string;
    deviceViewports?: string[];
    devicesQueryParam?: string;
    devicesAllValue?: string;
  };
  libraryModuleGallery?: {
    doc?: string;
    queryParam?: string;
    allValue?: string;
    categories?: string[];
    thinCategories?: string[];
    thinSignatures?: string[];
    maxPerCategory?: number;
    maxFiltered?: number;
    cardAspect?: number;
  };
  islandChunkReload?: {
    doc?: string;
    storageKey?: string;
    maxAttempts?: number;
  };
  islandSurfaces?: {
    doc?: string;
    homeRecentCount?: number;
    enrichmentListCap?: number;
    analysesListCap?: number;
    graphRoute?: string;
  };
  libraryReset?: {
    doc?: string;
    path?: string;
    confirm?: string;
    deleteCapturesPath?: string;
    deleteCapturesConfirm?: string;
  };
  captureJobs?: {
    doc?: string;
    insuranceDoc?: string;
    designDiversityDoc?: string;
    maxConcurrent?: number;
    hardTimeoutMs?: number;
    checkionTimeoutMs?: number;
    batchPath?: string;
    catalogsDir?: string;
    automotiveOem50?: string;
    crossIndustry100?: string;
    engineeringManufacturing1000?: string;
    insurance1000?: string;
    insurancePlus500?: string;
    designDiversity1000?: string;
    publicSector1000?: string;
    publicSectorPlus500?: string;
    awwwards500?: string;
    maxBatch?: number;
  };
  imageIngest?: {
    doc?: string;
    imagesPath?: string;
    maxConcurrent?: number;
    maxFiles?: number;
    maxBytes?: number;
    allowedMime?: string[];
    fieldName?: string;
    stagingDir?: string;
    intervention?: string;
    urlTemplate?: string;
    islandProxyMaxBody?: string;
    accept?: string;
  };
  pinterest?: {
    doc?: string;
    apiBase?: string;
    oauthAuthorize?: string;
    oauthToken?: string;
    pinUrlTemplate?: string;
    oauthScopes?: string[];
    clientIdEnv?: string;
    clientSecretEnv?: string;
    redirectUriEnv?: string;
    islandCallbackPath?: string;
    tokenFile?: string;
    pageSize?: number;
    maxPinsPerImport?: number;
    viewportName?: string;
    imageHostSuffixes?: string[];
    privacyPath?: string;
    website?: string;
    submissionDoc?: string;
  };
  mcpLibraryTools?: {
    screenSearch?: string;
    capturePromptPack?: string;
    composeBrief?: string;
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
    doc?: string;
    denseDoc?: string;
    dense?: {
      status: string;
      doc: string;
      provider: string;
      model: string;
      evalModel: string;
      dims: number;
      table: string;
      subjects: string[];
      maxCanonicalChars: number;
      queryInstruction: string;
      modelEnv: string;
      baseUrlEnv: string;
    };
    screenshot?: {
      status: string;
      doc: string;
      provider: string;
      model: string;
      dims: number;
      table: string;
      queryInstruction: string;
      modelEnv: string;
      baseUrlEnv: string;
      maxBytes: number;
    };
  };
  similarityGraph?: {
    doc?: string;
    nodeCap?: number;
    edgeCap?: number;
    threshold?: number;
    pageSize?: number;
    neighborK?: number;
    cacheTtlSec?: number;
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
  composeBrief: string;
} {
  const cfg = loadDigPaths(root).mcpLibraryTools;
  return {
    screenSearch: cfg?.screenSearch ?? "dig_screen_search",
    capturePromptPack: cfg?.capturePromptPack ?? "dig_capture_prompt_pack",
    composeBrief: cfg?.composeBrief ?? "dig_compose_brief"
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

export function cookieConsentConfig(root = process.cwd()): {
  retries: number;
  retryDelayMs: number;
  postDismissWaitMs: number;
  checkionFullPageSuffix: string;
  playwrightFullPageStem: string;
  iframeUrlPattern: string;
  preScreenshotRetries: number;
} {
  const cfg = loadDigPaths(root).cookieConsent;
  const retries = Number(cfg?.retries);
  const retryDelayMs = Number(cfg?.retryDelayMs);
  const postDismissWaitMs = Number(cfg?.postDismissWaitMs);
  const preScreenshotRetries = Number(cfg?.preScreenshotRetries);
  return {
    retries: Number.isFinite(retries) ? Math.max(0, Math.round(retries)) : 5,
    retryDelayMs: Number.isFinite(retryDelayMs) ? Math.max(0, Math.round(retryDelayMs)) : 1000,
    postDismissWaitMs: Number.isFinite(postDismissWaitMs) ? Math.max(0, Math.round(postDismissWaitMs)) : 800,
    checkionFullPageSuffix: cfg?.checkionFullPageSuffix ?? "checkion-full-page.jpg",
    playwrightFullPageStem: cfg?.playwrightFullPageStem ?? "full-page",
    iframeUrlPattern:
      cfg?.iframeUrlPattern ??
      "privacy-mgmt|sourcepoint|sp-prod|consentmanager|usercentrics|onetrust|cookielaw|iubenda|cookiebot|trustarc|evidon|cookieinformation|klaro|cookiescript|hs-scripts|zaraz",
    preScreenshotRetries: Number.isFinite(preScreenshotRetries) ? Math.max(0, Math.round(preScreenshotRetries)) : 2
  };
}

export function pinterestConfig(root = process.cwd()): {
  apiBase: string;
  oauthAuthorize: string;
  oauthToken: string;
  pinUrlTemplate: string;
  oauthScopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectUriEnv: string;
  islandCallbackPath: string;
  tokenFile: string;
  pageSize: number;
  maxPinsPerImport: number;
  viewportName: string;
  imageHostSuffixes: string[];
  apiPrefix: string;
} {
  const paths = loadDigPaths(root);
  const cfg = paths.pinterest;
  const pageSize = Number(cfg?.pageSize);
  const maxPins = Number(cfg?.maxPinsPerImport);
  return {
    apiBase: (cfg?.apiBase ?? "https://api.pinterest.com/v5").replace(/\/$/, ""),
    oauthAuthorize: cfg?.oauthAuthorize ?? "https://www.pinterest.com/oauth/",
    oauthToken: cfg?.oauthToken ?? "https://api.pinterest.com/v5/oauth/token",
    pinUrlTemplate: cfg?.pinUrlTemplate ?? "https://www.pinterest.com/pin/{pin_id}/",
    oauthScopes: cfg?.oauthScopes?.length ? cfg.oauthScopes : ["boards:read", "pins:read", "user_accounts:read"],
    clientIdEnv: cfg?.clientIdEnv ?? "PINTEREST_CLIENT_ID",
    clientSecretEnv: cfg?.clientSecretEnv ?? "PINTEREST_CLIENT_SECRET",
    redirectUriEnv: cfg?.redirectUriEnv ?? "PINTEREST_REDIRECT_URI",
    islandCallbackPath: cfg?.islandCallbackPath ?? "/api/pinterest/callback",
    tokenFile: cfg?.tokenFile ?? "pinterest-oauth.json",
    pageSize: Number.isFinite(pageSize) ? Math.min(250, Math.max(1, Math.round(pageSize))) : 25,
    maxPinsPerImport: Number.isFinite(maxPins) ? Math.min(100, Math.max(1, Math.round(maxPins))) : 40,
    viewportName: cfg?.viewportName ?? "desktop",
    imageHostSuffixes: cfg?.imageHostSuffixes?.length ? cfg.imageHostSuffixes : ["pinimg.com", "pinterest.com"],
    apiPrefix: paths.api.pinterestPath ?? "/api/pinterest"
  };
}

export function imageIngestConfig(root = process.cwd()): {
  doc: string;
  imagesPath: string;
  maxConcurrent: number;
  maxFiles: number;
  maxBytes: number;
  allowedMime: string[];
  fieldName: string;
  stagingDir: string;
  intervention: string;
  urlTemplate: string;
  islandProxyMaxBody: string;
  accept: string;
  website: string;
} {
  const paths = loadDigPaths(root);
  const cfg = paths.imageIngest;
  const website = (cfg?.urlTemplate?.includes("{website}")
    ? (paths.pinterest?.website ?? paths.coolify?.digFqdn ?? `http://${paths.web.host}:${paths.web.port}`)
    : ""
  ).replace(/\/$/, "");
  const template = cfg?.urlTemplate ?? "{website}/import/image/{id}/";
  const maxConcurrent = Number(cfg?.maxConcurrent);
  const maxFiles = Number(cfg?.maxFiles);
  const maxBytes = Number(cfg?.maxBytes);
  return {
    doc: cfg?.doc ?? "knowledge/image-ingest.md",
    imagesPath: cfg?.imagesPath ?? "/images",
    maxConcurrent: Number.isFinite(maxConcurrent) ? Math.min(16, Math.max(1, Math.round(maxConcurrent))) : 4,
    maxFiles: Number.isFinite(maxFiles) ? Math.min(100, Math.max(1, Math.round(maxFiles))) : 40,
    maxBytes: Number.isFinite(maxBytes) ? Math.max(1024, Math.round(maxBytes)) : 12 * 1024 * 1024,
    allowedMime: cfg?.allowedMime?.length
      ? cfg.allowedMime
      : ["image/jpeg", "image/png", "image/webp", "image/gif"],
    fieldName: cfg?.fieldName ?? "files",
    stagingDir: cfg?.stagingDir ?? "tmp/image-uploads",
    intervention: cfg?.intervention ?? "bulk_image_upload",
    urlTemplate: template.replaceAll("{website}", website),
    islandProxyMaxBody: cfg?.islandProxyMaxBody ?? "100mb",
    accept: cfg?.accept ?? "image/jpeg,image/png,image/webp,image/gif",
    website
  };
}

export function uploadedImageUrl(sourceId: string, root = process.cwd()): string {
  return imageIngestConfig(root).urlTemplate.replaceAll("{id}", encodeURIComponent(sourceId));
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
