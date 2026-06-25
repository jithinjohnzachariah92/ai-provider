/// <reference types="node" />
import { generateObject, generateText } from 'ai'
import type { CoreMessage } from 'ai'
import type { ZodSchema } from 'zod'
import { resolveProvider } from './provider.js'
import { buildModel } from './client.js'
import type { AIRequestOptions, AIResponse, ProviderConfig } from './types.js'

// Simple in-memory cache — zero deps, good enough for portfolio projects.
// Swap for Redis/Upstash when you need persistence across restarts.
const responseCache = new Map<string, unknown>()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * generateStructured
 * Use when you need typed, validated JSON output.
 * Requires a Zod schema. Throws on schema validation failure (retried up to 2x).
 *
 * @example
 * const result = await generateStructured({
 *   systemPrompt: MY_SYSTEM_PROMPT,
 *   prompt: userInput,
 *   schema: z.object({ name: z.string() }),
 *   cacheKey: `parse:${userInput}`,
 * })
 * console.log(result.data.name)
 */
export async function generateStructured<T>(
  options: AIRequestOptions<T> & { schema: ZodSchema<T> }
): Promise<AIResponse<T>> {
  const config = resolveProvider()

  const cached = checkCache<T>(options.cacheKey)
  if (cached) return cached

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const model = await buildModel(config)
  const messages = buildMessages(config, options.systemPrompt, options.prompt)

  const result = await withRetry(() =>
    generateObject({ model, messages, schema: options.schema, maxTokens: config.maxTokens })
  )

  return buildResponse(result.object, result.usage, config, options.cacheKey)
}

/**
 * generatePlainText
 * Use for non-structured outputs — summaries, rewrites, chat responses.
 */
export async function generatePlainText(
  options: Omit<AIRequestOptions, 'schema'>
): Promise<AIResponse<string>> {
  const config = resolveProvider()

  const cached = checkCache<string>(options.cacheKey)
  if (cached) return cached

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const model = await buildModel(config)
  const messages = buildMessages(config, options.systemPrompt, options.prompt)

  const result = await withRetry(() =>
    generateText({ model, messages, maxTokens: config.maxTokens })
  )

  return buildResponse(result.text, result.usage, config, options.cacheKey)
}

// ─── Internals ────────────────────────────────────────────────────────────────

function checkCache<T>(cacheKey?: string): AIResponse<T> | null {
  if (!cacheKey) return null
  const hit = responseCache.get(cacheKey)
  if (!hit) return null
  return { data: hit as T, provider: 'anthropic', model: 'cached', fromCache: true }
}

/**
 * Builds the messages array for the AI SDK.
 *
 * CoreSystemMessage.content must be a plain string — no arrays allowed.
 * Prompt caching metadata therefore goes on the user message content block,
 * which does accept an array of parts with experimental_providerMetadata.
 *
 * When usePromptCache is false (local Ollama, CI), we use plain strings
 * throughout — simpler and compatible with all providers.
 */
function buildMessages(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string
): CoreMessage[] {
  if (config.usePromptCache) {
    return [
      {
        role: 'system',
        content: systemPrompt, // must be string — CoreSystemMessage requirement
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
            // Cache the user turn too — Anthropic caches the full prefix up to
            // this block. The system prompt above is included in that prefix.
            experimental_providerMetadata: {
              anthropic: { cacheControl: { type: 'ephemeral' } },
            },
          },
        ],
      },
    ]
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

function buildResponse<T>(
  data: T,
  usage: { promptTokens: number; completionTokens: number } | undefined,
  config: ProviderConfig,
  cacheKey?: string
): AIResponse<T> {
  if (cacheKey) responseCache.set(cacheKey, data)

  const response: AIResponse<T> = {
    data,
    usage: usage
      ? { inputTokens: usage.promptTokens, outputTokens: usage.completionTokens, cachedTokens: 0 }
      : undefined,
    provider: config.provider,
    model: config.model,
    fromCache: false,
  }

  if (process.env.AI_LOG_USAGE === 'true') {
    console.log('[ai-provider]', {
      provider: config.provider,
      model: config.model,
      env: config.env,
      usage: response.usage,
    })
  }

  return response
}

function guardTokenBudget(text: string, maxTokens: number): void {
  const estimate = Math.ceil(text.length / 4)
  if (estimate > maxTokens) {
    throw new Error(
      `[ai-provider] Input exceeds token budget.\n` +
      `Estimated ~${estimate} tokens, limit is ${maxTokens}.\n` +
      `Trim your prompt or raise maxInputTokens in your call options.`
    )
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise<void>(r => setTimeout(r, 500 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError
}
