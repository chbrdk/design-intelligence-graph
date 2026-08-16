import { loadDigPaths } from "./runtime-paths.js";

export type LlmProviderKind = "local" | "openrouter";

export interface LlmProviderConfig {
  enabled: boolean;
  provider: LlmProviderKind;
  baseUrl: string;
  model: string;
  /** Optional vision-capable model id (OpenRouter VL / local VLM). */
  visionModel?: string;
  apiKey?: string;
  timeoutMs: number;
  stagedAnalysis?: boolean;
  stageMaxTokens?: number;
  /**
   * OpenRouter/Qwen-style reasoning control. Use "none" for cheap structured JSON
   * (Qwen3.7 Flash otherwise burns max_tokens on thinking and returns content=null).
   */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  /** When local fails (connection/timeout), retry with this provider. */
  fallbackProvider?: LlmProviderKind;
  /** Extra HTTP headers (OpenRouter referer/title). */
  headers?: Record<string, string>;
}

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmContentPart[];
}

export interface LlmTokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Provider-reported USD when available (OpenRouter `usage.cost`). */
  cost?: number;
}

export interface LlmCompletion {
  model: string;
  content: string;
  finish_reason: string | null;
  provider?: LlmProviderKind;
  usage?: LlmTokenUsage;
}


export type LlmCompleter = {
  complete(
    messages: LlmMessage[],
    options?: { maxTokens?: number; model?: string; reasoningEffort?: LlmProviderConfig["reasoningEffort"] }
  ): Promise<LlmCompletion>;
};

function normalizeMessageContent(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

function resolveProviderKind(environment: NodeJS.ProcessEnv, paths: ReturnType<typeof loadDigPaths>): LlmProviderKind {
  const fromEnv = (environment.DIG_LLM_PROVIDER ?? "").trim().toLowerCase();
  if (fromEnv === "openrouter" || fromEnv === "local") return fromEnv;
  const fromPaths = (paths.llm.providerDefault ?? "local").toLowerCase();
  return fromPaths === "openrouter" ? "openrouter" : "local";
}

function openrouterApiKey(environment: NodeJS.ProcessEnv, paths: ReturnType<typeof loadDigPaths>): string | undefined {
  const envName = paths.llm.openrouter?.apiKeyEnv ?? "OPENROUTER_API_KEY";
  return environment[envName] || environment.DIG_LLM_API_KEY || undefined;
}

export function localLlmConfig(environment: NodeJS.ProcessEnv = process.env): LlmProviderConfig {
  const paths = loadDigPaths();
  const inContainer = environment.DIG_IN_CONTAINER === "1";
  const provider = resolveProviderKind(environment, paths);
  const stagedDefault = paths.llm.stagedAnalysis !== false;
  const openrouter = paths.llm.openrouter;
  const fallbackRaw = (environment.DIG_LLM_FALLBACK ?? paths.llm.fallbackProvider ?? "").trim().toLowerCase();
  const fallbackProvider: LlmProviderKind | undefined =
    fallbackRaw === "openrouter" || fallbackRaw === "local" ? fallbackRaw : undefined;

  const enabled =
    environment.DIG_LLM_ENABLED === "true" ||
    (environment.DIG_LLM_ENABLED !== "false" && paths.llm.enabledDefault);

  if (provider === "openrouter") {
    const baseUrl = environment.DIG_LLM_BASE_URL ?? openrouter?.baseUrl ?? "https://openrouter.ai/api/v1";
    const model =
      environment.DIG_LLM_MODEL ?? openrouter?.defaultModel ?? "nvidia/nemotron-3-nano-30b-a3b:free";
    const visionModel = environment.DIG_LLM_VISION_MODEL ?? openrouter?.visionModel;
    const reasoningRaw = (environment.DIG_LLM_REASONING_EFFORT ?? "").trim().toLowerCase();
    const reasoningEffort =
      reasoningRaw === "none" ||
      reasoningRaw === "low" ||
      reasoningRaw === "medium" ||
      reasoningRaw === "high" ||
      reasoningRaw === "max"
        ? reasoningRaw
        : undefined;
    const config: LlmProviderConfig = {
      enabled,
      provider: "openrouter",
      baseUrl,
      model,
      timeoutMs: Number(environment.DIG_LLM_TIMEOUT_MS ?? String(paths.llm.timeoutMs)),
      stagedAnalysis: environment.DIG_LLM_STAGED === "false" ? false : stagedDefault,
      stageMaxTokens: Number(environment.DIG_LLM_STAGE_MAX_TOKENS ?? String(paths.llm.stageMaxTokens ?? 700)),
      headers: {
        ...(openrouter?.httpReferer ? { "HTTP-Referer": openrouter.httpReferer } : {}),
        ...(openrouter?.appTitle ? { "X-Title": openrouter.appTitle } : {})
      }
    };
    if (visionModel) config.visionModel = visionModel;
    if (reasoningEffort) config.reasoningEffort = reasoningEffort;
    const key = openrouterApiKey(environment, paths);
    if (key) config.apiKey = key;
    if (fallbackProvider && fallbackProvider !== "openrouter") config.fallbackProvider = fallbackProvider;
    return config;
  }

  const defaultBase = inContainer ? paths.llm.baseUrlFromContainer : paths.llm.defaultBaseUrl;
  const config: LlmProviderConfig = {
    enabled,
    provider: "local",
    baseUrl: environment.DIG_LLM_BASE_URL ?? defaultBase,
    model: environment.DIG_LLM_MODEL ?? paths.llm.defaultModel,
    visionModel: environment.DIG_LLM_VISION_MODEL ?? paths.llm.defaultModel,
    timeoutMs: Number(environment.DIG_LLM_TIMEOUT_MS ?? String(paths.llm.timeoutMs)),
    stagedAnalysis: environment.DIG_LLM_STAGED === "false" ? false : stagedDefault,
    stageMaxTokens: Number(environment.DIG_LLM_STAGE_MAX_TOKENS ?? String(paths.llm.stageMaxTokens ?? 700))
  };
  if (environment.DIG_LLM_API_KEY) config.apiKey = environment.DIG_LLM_API_KEY;
  if (fallbackProvider && fallbackProvider !== "local") config.fallbackProvider = fallbackProvider;
  return config;
}

/** Build OpenRouter config used as fallback when local Gemma is unavailable. */
export function openrouterFallbackConfig(
  environment: NodeJS.ProcessEnv = process.env,
  base = localLlmConfig(environment)
): LlmProviderConfig {
  const paths = loadDigPaths();
  const openrouter = paths.llm.openrouter;
  const key = openrouterApiKey(environment, paths);
  const config: LlmProviderConfig = {
    enabled: base.enabled,
    provider: "openrouter",
    baseUrl: openrouter?.baseUrl ?? "https://openrouter.ai/api/v1",
    model: openrouter?.defaultModel ?? "nvidia/nemotron-3-nano-30b-a3b:free",
    timeoutMs: base.timeoutMs,
    headers: {
      ...(openrouter?.httpReferer ? { "HTTP-Referer": openrouter.httpReferer } : {}),
      ...(openrouter?.appTitle ? { "X-Title": openrouter.appTitle } : {})
    }
  };
  if (base.stagedAnalysis !== undefined) config.stagedAnalysis = base.stagedAnalysis;
  if (base.stageMaxTokens !== undefined) config.stageMaxTokens = base.stageMaxTokens;
  const visionModel = openrouter?.visionModel ?? base.visionModel;
  if (visionModel) config.visionModel = visionModel;
  if (key) config.apiKey = key;
  return config;
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("no message content") ||
    message.includes("local llm request failed: 5") ||
    message.includes("local llm request failed: 502") ||
    message.includes("local llm request failed: 503") ||
    message.includes("local llm request failed: 504") ||
    message.includes("local llm request failed: 429")
  );
}

export class OpenAiCompatibleLlmProvider {
  constructor(
    private readonly config: LlmProviderConfig,
    private readonly request: typeof fetch = fetch
  ) {}

  get provider(): LlmProviderKind {
    return this.config.provider;
  }

  async complete(
    messages: LlmMessage[],
    options: {
      maxTokens?: number;
      model?: string;
      reasoningEffort?: LlmProviderConfig["reasoningEffort"];
      /** Internal: already retried empty-content once. */
      _emptyRetry?: boolean;
    } = {}
  ): Promise<LlmCompletion> {
    if (!this.config.enabled) {
      throw new Error("Local LLM is disabled; set DIG_LLM_ENABLED=true to enable it.");
    }
    if (this.config.provider === "openrouter" && !this.config.apiKey) {
      throw new Error("OpenRouter requires OPENROUTER_API_KEY (or DIG_LLM_API_KEY).");
    }
    const model = options.model ?? this.config.model;
    const reasoningEffort = options.reasoningEffort ?? this.config.reasoningEffort;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        messages,
        temperature: 0,
        max_tokens: options.maxTokens ?? this.config.stageMaxTokens ?? 1200
      };
      // Always send reasoning=none for VL JSON stages — free VL models often burn the budget on thinking.
      const effort = reasoningEffort ?? "none";
      body.reasoning = { effort };
      body.enable_thinking = effort !== "none";
      const response = await this.request(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...(this.config.headers ?? {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        const detail = errBody ? `: ${errBody.slice(0, 240)}` : "";
        throw new Error(`Local LLM request failed: ${response.status}${detail}`);
      }
      const data = (await response.json()) as {
        model?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          cost?: number;
        };
        choices?: Array<{
          message?: { content?: unknown; reasoning?: string };
          finish_reason?: string | null;
        }>;
      };
      const choice = data.choices?.[0];
      let content = normalizeMessageContent(choice?.message?.content);
      // Some VL/reasoning models put JSON only in `reasoning` when content is empty.
      if (!content) {
        const reasoningText = (choice?.message?.reasoning ?? "").trim();
        if (reasoningText.includes("{") && reasoningText.includes("}")) {
          content = reasoningText;
        }
      }
      if (!content) {
        if (!options._emptyRetry) {
          clearTimeout(timer);
          return this.complete(messages, {
            ...options,
            reasoningEffort: "none",
            maxTokens: Math.max(options.maxTokens ?? 0, 2800),
            _emptyRetry: true
          });
        }
        const reasoningPreview = (choice?.message?.reasoning ?? "").slice(0, 120);
        throw new Error(
          reasoningPreview
            ? `Local LLM response has no message content (finish=${choice?.finish_reason ?? "unknown"}; reasoning burned tokens). Set DIG_LLM_REASONING_EFFORT=none or raise max_tokens.`
            : "Local LLM response has no message content"
        );
      }
      const usage: LlmTokenUsage | undefined = data.usage
        ? {
            ...(data.usage.prompt_tokens !== undefined ? { prompt_tokens: data.usage.prompt_tokens } : {}),
            ...(data.usage.completion_tokens !== undefined ? { completion_tokens: data.usage.completion_tokens } : {}),
            ...(data.usage.total_tokens !== undefined ? { total_tokens: data.usage.total_tokens } : {}),
            ...(data.usage.cost !== undefined ? { cost: data.usage.cost } : {})
          }
        : undefined;
      return {
        model: data.model ?? model,
        content,
        finish_reason: choice?.finish_reason ?? null,
        provider: this.config.provider,
        ...(usage ? { usage } : {})
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async completeVision(
    messages: LlmMessage[],
    options: { maxTokens?: number } = {}
  ): Promise<LlmCompletion> {
    const visionModel = this.config.visionModel ?? this.config.model;
    return this.complete(messages, {
      ...options,
      model: visionModel,
      reasoningEffort: "none",
      maxTokens: Math.max(options.maxTokens ?? 0, 2000)
    });
  }
}

/** Primary provider with optional OpenRouter fallback when local Gemma is busy/down. */
export class FallbackLlmProvider {
  constructor(
    private readonly primary: OpenAiCompatibleLlmProvider,
    private readonly fallback: OpenAiCompatibleLlmProvider | null,
    private readonly primaryConfig: LlmProviderConfig
  ) {}

  async complete(
    messages: LlmMessage[],
    options: {
      maxTokens?: number;
      model?: string;
      reasoningEffort?: LlmProviderConfig["reasoningEffort"];
    } = {}
  ): Promise<LlmCompletion> {
    try {
      return await this.primary.complete(messages, options);
    } catch (error) {
      if (!this.fallback || this.primaryConfig.fallbackProvider !== "openrouter" || !isRetryableProviderError(error)) {
        throw error;
      }
      // Drop explicit model so the fallback provider's configured model/vision model is used.
      const { model: _model, ...rest } = options;
      return this.fallback.complete(messages, rest);
    }
  }
}

/**
 * Build a completer for an already-resolved config (e.g. enrichment bulk-model override).
 * Preserves local → OpenRouter fallback so callers that pass `config` do not skip it.
 * When OpenRouter is primary, also fall back to an alternate vision model on empty/429 errors.
 */
export function createLlmProviderFromConfig(
  config: LlmProviderConfig,
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): LlmCompleter {
  const paths = loadDigPaths();
  const primary = new OpenAiCompatibleLlmProvider(config, request);
  if (config.provider === "local" && config.fallbackProvider === "openrouter") {
    const fallbackConfig = openrouterFallbackConfig(environment, config);
    fallbackConfig.model = config.model;
    if (config.visionModel) fallbackConfig.visionModel = config.visionModel;
    if (config.reasoningEffort) fallbackConfig.reasoningEffort = config.reasoningEffort;
    if (fallbackConfig.apiKey) {
      return new FallbackLlmProvider(primary, new OpenAiCompatibleLlmProvider(fallbackConfig, request), config);
    }
  }
  if (config.provider === "openrouter") {
    const altVision =
      environment.DIG_LLM_VISION_FALLBACK_MODEL ??
      (paths.llm.openrouter as { visionModelFallback?: string } | undefined)?.visionModelFallback ??
      "";
    const currentVision = config.visionModel ?? config.model;
    if (altVision && currentVision && altVision !== currentVision) {
      const altConfig: LlmProviderConfig = {
        ...config,
        model: altVision,
        visionModel: altVision,
        reasoningEffort: "none",
        fallbackProvider: "openrouter"
      };
      return new FallbackLlmProvider(
        primary,
        new OpenAiCompatibleLlmProvider(altConfig, request),
        { ...config, fallbackProvider: "openrouter" }
      );
    }
  }
  return primary;
}

export function createLlmProvider(
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): LlmCompleter {
  return createLlmProviderFromConfig(localLlmConfig(environment), environment, request);
}
