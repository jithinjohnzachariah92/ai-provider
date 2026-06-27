/// <reference types="node" />
import { generateObject, generateText } from 'ai'
import type { CoreMessage } from 'ai'
import type { ZodSchema } from 'zod'
import { resolveProvider } from './provider.js'
import { buildModel } from './client.js'
import { responseCache } from './cache.js'
import { wrapError, isRetryable, AIProviderError } from './errors.js'
import type { AIRequestOptions, AIResponse, ProviderConfig } from './types.js'

// Default request timeout — 30s for cloud, 60s for local Ollama (model load time)
const TIMEOUT_MS = {
  ollama:    parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
  anthropic: parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  openai:    parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  google:    parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  groq:      parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  mistral:   parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * generateStructured — typed, validated JSON output.
 *
 * @example
 * const result = await generateStructured({
 *   systemPrompt: MY_SYSTEM_PROMPT,
 *   prompt: userInput,
 *   schema: z.object({ name: z.string() }),
 *   cacheKey: `parse:${userInput}`,
 * })
 */
export async function generateStructured<T>(
  options: AIRequestOptions<T> & { schema: ZodSchema<T> }
): Promise<AIResponse<T>> {
  const config = resolveProvider()

  const cached = responseCache.get<T>(options.cacheKey ?? '')
  if (cached && options.cacheKey) {
    return { data: cached, provider: config.provider, model: config.model, fromCache: true }
  }

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const model    = await buildModel(config)
  const messages = buildMessages(config, options.systemPrompt, options.prompt)
  const timeout  = TIMEOUT_MS[config.provider]

  const result = await withRetry(
    () => withTimeout(
      () => generateObject({ model, messages, schema: options.schema, maxTokens: config.maxTokens }),
      timeout
    ),
    config.provider
  )

  return buildResponse(result.object, result.usage, config, options.cacheKey)
}

/**
 * generatePlainText — unstructured text output.
 */
export async function generatePlainText(
  options: Omit<AIRequestOptions, 'schema'>
): Promise<AIResponse<string>> {
  const config = resolveProvider()

  const cached = responseCache.get<string>(options.cacheKey ?? '')
  if (cached && options.cacheKey) {
    return { data: cached, provider: config.provider, model: config.model, fromCache: true }
  }

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const model    = await buildModel(config)
  const messages = buildMessages(config, options.systemPrompt, options.prompt)
  const timeout  = TIMEOUT_MS[config.provider]

  const result = await withRetry(
    () => withTimeout(
      () => generateText({ model, messages, maxTokens: config.maxTokens }),
      timeout
    ),
    config.provider
  )

  return buildResponse(result.text, result.usage, config, options.cacheKey)
}

// ─── Internals ────────────────────────────────────────────────────────────────

function buildMessages(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string
): CoreMessage[] {
  if (config.usePromptCache) {
    return [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
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
    throw new AIProviderError(
      `[ai-provider] Input exceeds token budget.\n` +
      `Estimated ~${estimate} tokens, limit is ${maxTokens}.\n` +
      `Trim your prompt or raise maxInputTokens in your call options.`,
      'TOKEN_BUDGET'
    )
  }
}

/**
 * Wraps a promise with a hard timeout.
 * Throws an AIProviderError with code TIMEOUT if it exceeds the limit.
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AIProviderError(
        `[ai-provider] Request timed out after ${timeoutMs}ms.\n` +
        `If using Ollama locally, the model may still be loading — try again in a few seconds.\n` +
        `Override timeout: AI_TIMEOUT_MS=90000`,
        'TIMEOUT'
      ))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([fn(), timeoutPromise])
    clearTimeout(timer!)
    return result
  } catch (err) {
    clearTimeout(timer!)
    throw err
  }
}

/**
 * Retries only transient errors (rate limit, server error, timeout).
 * Never retries auth, billing, or validation errors — they won't recover.
 */
async function withRetry<T>(fn: () => Promise<T>, provider: string, maxRetries = 2): Promise<T> {
  let lastError: AIProviderError | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      // Wrap into AIProviderError for consistent classification
      const wrapped = err instanceof AIProviderError ? err : wrapError(err, provider)

      // Non-retryable — throw immediately, no backoff wasted
      if (!isRetryable(wrapped.code)) {
        throw wrapped
      }

      lastError = wrapped

      if (attempt < maxRetries) {
        const backoff = 500 * Math.pow(2, attempt) // 500ms, 1000ms
        if (process.env.AI_LOG_USAGE === 'true') {
          console.warn(`[ai-provider] Retrying (attempt ${attempt + 1}/${maxRetries}) after ${backoff}ms — ${wrapped.code}`)
        }
        await new Promise<void>(r => setTimeout(r, backoff))
      }
    }
  }

  throw lastError
}
