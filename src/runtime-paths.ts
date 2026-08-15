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
  };
  runtime: {
    capturesDir: string;
    indexesDir: string;
    containerCapturesDir: string;
    containerIndexesDir: string;
  };
  captureLimits?: {
    maxHtmlBytes?: number;
    screenshotFormat?: string;
    webpQuality?: number;
    [key: string]: unknown;
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
      doc?: string;
    };
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
