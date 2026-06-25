// src/gateway.ts
import { generateObject, generateText } from "ai";

// src/provider.ts
function resolveProvider() {
  const env = resolveEnvironment();
  const providerOverride = process.env.AI_PROVIDER;
  const modelOverride = process.env.AI_MODEL;
  if (providerOverride === "anthropic") return buildAnthropicConfig(env, modelOverride);
  if (providerOverride === "ollama") return buildOllamaConfig(modelOverride);
  switch (env) {
    case "development":
      return buildOllamaConfig(modelOverride);
    case "test":
      return buildAnthropicConfig("test", modelOverride);
    case "production":
      return buildAnthropicConfig("production", modelOverride);
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
function buildAnthropicConfig(env, modelOverride) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "[ai-provider] ANTHROPIC_API_KEY is not set.\nAdd it to .env.local for cloud testing, or to your deployment secrets.\nFor local dev without a key, ensure NODE_ENV=development (uses Ollama)."
    );
  }
  if (env === "test") {
    return {
      provider: "anthropic",
      model: modelOverride ?? "claude-haiku-4-5-20251001",
      maxTokens: 512,
      usePromptCache: false,
      env: "test"
    };
  }
  return {
    provider: "anthropic",
    model: modelOverride ?? "claude-sonnet-4-6",
    maxTokens: 1024,
    usePromptCache: true,
    env: "production"
  };
}

// src/client.ts
async function buildModel(config) {
  if (config.provider === "ollama") {
    return buildOllamaModel(config);
  }
  return buildAnthropicModel(config);
}
async function buildOllamaModel(config) {
  let createOllama;
  try {
    const mod = await import("ollama-ai-provider");
    createOllama = mod.createOllama;
  } catch {
    throw new Error(
      "[ai-provider] ollama-ai-provider is not installed.\nRun: npm install ollama-ai-provider"
    );
  }
  const ollama = createOllama({
    // Must be /v1 — Vercel AI SDK uses the OpenAI-compatible endpoint
    baseURL: `${config.baseURL}/v1`
  });
  return ollama(config.model);
}
async function buildAnthropicModel(config) {
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  return anthropic(config.model);
}

// src/gateway.ts
var responseCache = /* @__PURE__ */ new Map();
async function generateStructured(options) {
  const config = resolveProvider();
  const cached = checkCache(options.cacheKey);
  if (cached) return cached;
  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8e3);
  const model = await buildModel(config);
  const messages = buildMessages(config, options.systemPrompt, options.prompt);
  const result = await withRetry(
    () => generateObject({ model, messages, schema: options.schema, maxTokens: config.maxTokens })
  );
  return buildResponse(result.object, result.usage, config, options.cacheKey);
}
async function generatePlainText(options) {
  const config = resolveProvider();
  const cached = checkCache(options.cacheKey);
  if (cached) return cached;
  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8e3);
  const model = await buildModel(config);
  const messages = buildMessages(config, options.systemPrompt, options.prompt);
  const result = await withRetry(
    () => generateText({ model, messages, maxTokens: config.maxTokens })
  );
  return buildResponse(result.text, result.usage, config, options.cacheKey);
}
function checkCache(cacheKey) {
  if (!cacheKey) return null;
  const hit = responseCache.get(cacheKey);
  if (!hit) return null;
  return { data: hit, provider: "anthropic", model: "cached", fromCache: true };
}
function buildMessages(config, systemPrompt, userPrompt) {
  if (config.usePromptCache) {
    return [
      {
        role: "system",
        content: systemPrompt
        // must be string — CoreSystemMessage requirement
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
            // Cache the user turn too — Anthropic caches the full prefix up to
            // this block. The system prompt above is included in that prefix.
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
    throw new Error(
      `[ai-provider] Input exceeds token budget.
Estimated ~${estimate} tokens, limit is ${maxTokens}.
Trim your prompt or raise maxInputTokens in your call options.`
    );
  }
}
async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}
export {
  generatePlainText,
  generateStructured,
  resolveProvider
};
