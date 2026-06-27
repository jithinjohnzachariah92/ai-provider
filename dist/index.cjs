"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AIProviderError: () => AIProviderError,
  generatePlainText: () => generatePlainText,
  generateStructured: () => generateStructured,
  resolveProvider: () => resolveProvider,
  responseCache: () => responseCache
});
module.exports = __toCommonJS(index_exports);

// src/gateway.ts
var import_ai = require("ai");

// src/provider.ts
function resolveProvider() {
  const env = resolveEnvironment();
  const providerOverride = process.env.AI_PROVIDER;
  const modelOverride = process.env.AI_MODEL;
  if (providerOverride && providerOverride !== "ollama") {
    return buildCloudConfig(providerOverride, env, modelOverride);
  }
  if (providerOverride === "ollama") {
    return buildOllamaConfig(modelOverride);
  }
  switch (env) {
    case "development":
      return buildOllamaConfig(modelOverride);
    case "test":
      return buildCloudConfig("anthropic", "test", modelOverride);
    case "production":
      return buildCloudConfig("anthropic", "production", modelOverride);
  }
}
function resolveEnvironment() {
  const raw = process.env.NODE_ENV;
  if (raw === "test") return "test";
  if (raw === "production") return "production";
  return "development";
}
function buildOllamaConfig(modelOverride) {
  return {
    provider: "ollama",
    model: modelOverride ?? process.env.OLLAMA_MODEL ?? "qwen2.5-coder:14b",
    baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    maxTokens: 2048,
    usePromptCache: false,
    env: "development"
  };
}
function buildCloudConfig(provider, env, modelOverride) {
  const isTest = env === "test";
  const defaults = {
    anthropic: {
      test: "claude-haiku-4-5-20251001",
      production: "claude-sonnet-4-6"
    },
    openai: {
      test: "gpt-4o-mini",
      production: "gpt-4o"
    },
    google: {
      test: "gemini-1.5-flash",
      production: "gemini-1.5-pro"
    },
    groq: {
      test: "llama-3.1-8b-instant",
      production: "llama-3.1-70b-versatile"
    },
    mistral: {
      test: "mistral-small-latest",
      production: "mistral-large-latest"
    }
  };
  return {
    provider,
    model: modelOverride ?? defaults[provider][isTest ? "test" : "production"],
    maxTokens: isTest ? 512 : 1024,
    // Only Anthropic supports prompt caching via this SDK
    usePromptCache: provider === "anthropic" && !isTest,
    env
  };
}

// src/errors.ts
var AIProviderError = class extends Error {
  constructor(message, code, provider, status, cause) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.status = status;
    this.cause = cause;
    this.name = "AIProviderError";
  }
};
function isRetryable(code) {
  return code === "RATE_LIMIT" || code === "SERVER_ERROR" || code === "TIMEOUT";
}
function classifyError(err) {
  const message = errorMessage(err);
  const status = extractStatus(err);
  if (status === 401) return "AUTH_ERROR";
  if (status === 402) return "BILLING_ERROR";
  if (status === 403) return "BILLING_ERROR";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500 && status < 600) return "SERVER_ERROR";
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("authentication") || lower.includes("unauthorized"))
    return "AUTH_ERROR";
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota"))
    return "BILLING_ERROR";
  if (lower.includes("rate limit") || lower.includes("too many requests"))
    return "RATE_LIMIT";
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout"))
    return "TIMEOUT";
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("pull")))
    return "MODEL_NOT_FOUND";
  if (lower.includes("schema") || lower.includes("validation") || lower.includes("parse"))
    return "SCHEMA_VALIDATION";
  return "UNKNOWN";
}
function wrapError(err, provider) {
  const code = classifyError(err);
  const status = extractStatus(err);
  const message = buildMessage(code, provider, errorMessage(err));
  return new AIProviderError(message, code, provider, status, err);
}
function buildMessage(code, provider, raw) {
  switch (code) {
    case "AUTH_ERROR":
      return `[ai-provider] Authentication failed for "${provider}".
Check your API key is set correctly and hasn't expired.
Env var: ${providerKeyName(provider)}`;
    case "BILLING_ERROR":
      return `[ai-provider] Billing or quota issue for "${provider}".
Check your account has active credits at the provider dashboard.`;
    case "RATE_LIMIT":
      return `[ai-provider] Rate limit hit for "${provider}".
Request will be retried with exponential backoff.`;
    case "MODEL_NOT_FOUND":
      return `[ai-provider] Model not found for "${provider}".
If using Ollama locally, run: ollama pull <model-name>
Raw: ${raw}`;
    case "TIMEOUT":
      return `[ai-provider] Request timed out for "${provider}".
Check your network connection and provider status.`;
    case "SCHEMA_VALIDATION":
      return `[ai-provider] Response from "${provider}" did not match the expected schema.
Try making your system prompt more explicit about the output format.
Raw: ${raw}`;
    default:
      return `[ai-provider] Unexpected error from "${provider}": ${raw}`;
  }
}
function providerKeyName(provider) {
  const keys = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY"
  };
  return keys[provider] ?? `${provider.toUpperCase()}_API_KEY`;
}
function extractStatus(err) {
  if (err && typeof err === "object") {
    if ("status" in err && typeof err.status === "number")
      return err.status;
    if ("statusCode" in err && typeof err.statusCode === "number")
      return err.statusCode;
  }
  return 0;
}
function errorMessage(err) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

// src/client.ts
async function buildModel(config) {
  switch (config.provider) {
    case "ollama":
      return buildOllamaModel(config);
    case "anthropic":
      return buildAnthropicModel(config);
    case "openai":
      return buildOpenAIModel(config);
    case "google":
      return buildGoogleModel(config);
    case "groq":
      return buildGroqModel(config);
    case "mistral":
      return buildMistralModel(config);
  }
}
async function buildOllamaModel(config) {
  await assertOllamaReachable(config.baseURL ?? "http://localhost:11434");
  try {
    const { createOllama } = await import("ollama-ai-provider");
    const ollama = createOllama({ baseURL: `${config.baseURL}/api` });
    return ollama(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) {
      throw new AIProviderError(
        "[ai-provider] ollama-ai-provider is not installed.\nRun: npm install ollama-ai-provider",
        "UNKNOWN",
        "ollama"
      );
    }
    throw err;
  }
}
async function assertOllamaReachable(baseURL) {
  try {
    const res = await fetch(baseURL, { signal: AbortSignal.timeout(3e3) });
    if (!res.ok && res.status !== 200) throw new Error(`status ${res.status}`);
  } catch {
    throw new AIProviderError(
      `[ai-provider] Ollama is not reachable at ${baseURL}.

  Start Ollama:       brew services start ollama
  Or (foreground):    ollama serve

  To use a cloud provider instead:
    Set AI_PROVIDER=anthropic (and ANTHROPIC_API_KEY) in your .env
    Or: AI_PROVIDER=openai (and OPENAI_API_KEY)
    Or: AI_PROVIDER=groq   (and GROQ_API_KEY \u2014 free tier available)`,
      "UNKNOWN",
      "ollama"
    );
  }
}
async function buildAnthropicModel(config) {
  assertKey("ANTHROPIC_API_KEY", "anthropic", "@ai-sdk/anthropic");
  try {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled("@ai-sdk/anthropic");
    throw err;
  }
}
async function buildOpenAIModel(config) {
  assertKey("OPENAI_API_KEY", "openai", "@ai-sdk/openai");
  try {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled("@ai-sdk/openai");
    throw err;
  }
}
async function buildGoogleModel(config) {
  assertKey("GOOGLE_GENERATIVE_AI_API_KEY", "google", "@ai-sdk/google");
  try {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
    return google(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled("@ai-sdk/google");
    throw err;
  }
}
async function buildGroqModel(config) {
  assertKey("GROQ_API_KEY", "groq", "@ai-sdk/groq");
  try {
    const { createGroq } = await import("@ai-sdk/groq");
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    return groq(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled("@ai-sdk/groq");
    throw err;
  }
}
async function buildMistralModel(config) {
  assertKey("MISTRAL_API_KEY", "mistral", "@ai-sdk/mistral");
  try {
    const { createMistral } = await import("@ai-sdk/mistral");
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
    return mistral(config.model);
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled("@ai-sdk/mistral");
    throw err;
  }
}
function assertKey(envVar, provider, pkg) {
  if (!process.env[envVar]) {
    throw new AIProviderError(
      `[ai-provider] ${envVar} is not set.

  This is required for the "${provider}" provider.

  1. Install the SDK:   npm install ${pkg}
  2. Set the key:
       Local:       add ${envVar}=<your-key> to .env.local
       Vercel:      add it in Project Settings \u2192 Environment Variables
       AWS:         add it to your task definition or Secrets Manager
       GitHub CI:   add it to repo secrets and reference as \${{ secrets.${envVar} }}

  Get a key at: ${providerDashboard(provider)}`,
      "AUTH_ERROR",
      provider
    );
  }
}
function notInstalled(pkg) {
  throw new AIProviderError(
    `[ai-provider] ${pkg} is not installed.
Run: npm install ${pkg}`,
    "UNKNOWN"
  );
}
function isModuleNotFound(err) {
  return err instanceof Error && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";
}
function providerDashboard(provider) {
  const dashboards = {
    anthropic: "https://console.anthropic.com",
    openai: "https://platform.openai.com/api-keys",
    google: "https://aistudio.google.com/app/apikey",
    groq: "https://console.groq.com/keys",
    mistral: "https://console.mistral.ai/api-keys"
  };
  return dashboards[provider] ?? `https://${provider}.com`;
}

// src/cache.ts
var BoundedCache = class {
  constructor(maxSize, ttlMs) {
    this.store = /* @__PURE__ */ new Map();
    this.maxSize = maxSize ?? parseInt(process.env.AI_CACHE_MAX_SIZE ?? "500", 10);
    this.ttlMs = ttlMs ?? parseInt(process.env.AI_CACHE_TTL_MS ?? String(5 * 60 * 1e3), 10);
  }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  set(key, value) {
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }
  delete(key) {
    this.store.delete(key);
  }
  /** Clear all entries — useful between tests */
  clear() {
    this.store.clear();
  }
  get size() {
    return this.store.size;
  }
};
var responseCache = new BoundedCache();

// src/gateway.ts
var TIMEOUT_MS = {
  ollama: parseInt(process.env.AI_TIMEOUT_MS ?? "60000", 10),
  anthropic: parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10),
  openai: parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10),
  google: parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10),
  groq: parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10),
  mistral: parseInt(process.env.AI_TIMEOUT_MS ?? "30000", 10)
};
async function generateStructured(options) {
  const config = resolveProvider();
  const cached = responseCache.get(options.cacheKey ?? "");
  if (cached && options.cacheKey) {
    return { data: cached, provider: config.provider, model: config.model, fromCache: true };
  }
  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8e3);
  const model = await buildModel(config);
  const messages = buildMessages(config, options.systemPrompt, options.prompt);
  const timeout = TIMEOUT_MS[config.provider];
  const result = await withRetry(
    () => withTimeout(
      () => (0, import_ai.generateObject)({ model, messages, schema: options.schema, maxTokens: config.maxTokens }),
      timeout
    ),
    config.provider
  );
  return buildResponse(result.object, result.usage, config, options.cacheKey);
}
async function generatePlainText(options) {
  const config = resolveProvider();
  const cached = responseCache.get(options.cacheKey ?? "");
  if (cached && options.cacheKey) {
    return { data: cached, provider: config.provider, model: config.model, fromCache: true };
  }
  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8e3);
  const model = await buildModel(config);
  const messages = buildMessages(config, options.systemPrompt, options.prompt);
  const timeout = TIMEOUT_MS[config.provider];
  const result = await withRetry(
    () => withTimeout(
      () => (0, import_ai.generateText)({ model, messages, maxTokens: config.maxTokens }),
      timeout
    ),
    config.provider
  );
  return buildResponse(result.text, result.usage, config, options.cacheKey);
}
function buildMessages(config, systemPrompt, userPrompt) {
  if (config.usePromptCache) {
    return [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
            experimental_providerMetadata: {
              anthropic: { cacheControl: { type: "ephemeral" } }
            }
          }
        ]
      }
    ];
  }
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];
}
function buildResponse(data, usage, config, cacheKey) {
  if (cacheKey) responseCache.set(cacheKey, data);
  const response = {
    data,
    usage: usage ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, cachedTokens: 0 } : void 0,
    provider: config.provider,
    model: config.model,
    fromCache: false
  };
  if (process.env.AI_LOG_USAGE === "true") {
    console.log("[ai-provider]", {
      provider: config.provider,
      model: config.model,
      env: config.env,
      usage: response.usage
    });
  }
  return response;
}
function guardTokenBudget(text, maxTokens) {
  const estimate = Math.ceil(text.length / 4);
  if (estimate > maxTokens) {
    throw new AIProviderError(
      `[ai-provider] Input exceeds token budget.
Estimated ~${estimate} tokens, limit is ${maxTokens}.
Trim your prompt or raise maxInputTokens in your call options.`,
      "TOKEN_BUDGET"
    );
  }
}
async function withTimeout(fn, timeoutMs) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AIProviderError(
        `[ai-provider] Request timed out after ${timeoutMs}ms.
If using Ollama locally, the model may still be loading \u2014 try again in a few seconds.
Override timeout: AI_TIMEOUT_MS=90000`,
        "TIMEOUT"
      ));
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
async function withRetry(fn, provider, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const wrapped = err instanceof AIProviderError ? err : wrapError(err, provider);
      if (!isRetryable(wrapped.code)) {
        throw wrapped;
      }
      lastError = wrapped;
      if (attempt < maxRetries) {
        const backoff = 500 * Math.pow(2, attempt);
        if (process.env.AI_LOG_USAGE === "true") {
          console.warn(`[ai-provider] Retrying (attempt ${attempt + 1}/${maxRetries}) after ${backoff}ms \u2014 ${wrapped.code}`);
        }
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastError;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AIProviderError,
  generatePlainText,
  generateStructured,
  resolveProvider,
  responseCache
});
