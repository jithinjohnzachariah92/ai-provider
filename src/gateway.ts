/// <reference types="node" />
import { generateText, Output } from 'ai'
import type { ModelMessage } from 'ai'
import type { ZodSchema } from 'zod'
import { resolveProvider } from './provider.js'
import { buildModel } from './client.js'
import { CacheStats, responseCache } from './cache.js'
import { wrapError, isRetryable, AIProviderError } from './errors.js'
import { emitEvent } from './observability.js'
import type { AIRequestOptions, AIResponse, ProviderConfig } from './types.js'

const TIMEOUT_MS = {
  ollama:    parseInt(process.env.AI_TIMEOUT_MS ?? '60000', 10),
  anthropic: parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  openai:    parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  google:    parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  groq:      parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  mistral:   parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateStructured<T>(
  options: AIRequestOptions<T> & { schema: ZodSchema<T> }
): Promise<AIResponse<T>> {
  const config = resolveProvider()

  // Cache check — emit a cache.hit event so cache effectiveness is observable
  const cached = responseCache.get<T>(options.cacheKey ?? '')
  if (cached && options.cacheKey) {
    emitEvent({
      type: 'cache.hit',
      timestamp: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      env: config.env,
      correlationId: options.correlationId,
      cacheStats: responseCache.getStats(), 
    })
    logCacheHitBox(config, responseCache.getStats())   // terminal visibility
    return { data: cached, provider: config.provider, model: config.model, fromCache: true }
  }

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const { system, messages } = buildMessages(config, options.systemPrompt, options.prompt)
  const timeout  = TIMEOUT_MS[config.provider]

  const result = await execute(
    async () => {
      // buildModel runs inside execute so connectivity/auth errors are
      // captured by the instrumented error handling and emit failure events
      const model = await buildModel(config)
      return generateText({
        model, system, messages,
        output: Output.object({ schema: options.schema }),
        maxOutputTokens: config.maxTokens,
      })
    },
    config, timeout, options.correlationId
  )

  return buildResponse(result.output as T, result.usage, config, options.cacheKey)
}

export async function generatePlainText(
  options: Omit<AIRequestOptions, 'schema'>
): Promise<AIResponse<string>> {
  const config = resolveProvider()

  const cached = responseCache.get<string>(options.cacheKey ?? '')
  if (cached && options.cacheKey) {
    emitEvent({
      type: 'cache.hit',
      timestamp: new Date().toISOString(),
      provider: config.provider,
      model: config.model,
      env: config.env,
      correlationId: options.correlationId,
    })
    return { data: cached, provider: config.provider, model: config.model, fromCache: true }
  }

  guardTokenBudget(options.systemPrompt + options.prompt, options.maxInputTokens ?? 8000)

  const { system, messages } = buildMessages(config, options.systemPrompt, options.prompt)
  const timeout  = TIMEOUT_MS[config.provider]

  const result = await execute(
    async () => {
      const model = await buildModel(config)
      return generateText({ model, system, messages, maxOutputTokens: config.maxTokens })
    },
    config, timeout, options.correlationId
  )

  return buildResponse(result.text, result.usage, config, options.cacheKey)
}

// ─── Instrumented execution ─────────────────────────────────────────────────────
// Single path for timing, retry, timeout, and event emission.
// Both public methods route through here so observability is consistent.

async function execute<T>(
  fn: () => Promise<T>,
  config: ProviderConfig,
  timeoutMs: number,
  correlationId?: string
): Promise<T> {
  const start = Date.now()
  let lastError: AIProviderError | undefined

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const result = await withTimeout(fn, timeoutMs)

      // Success — emit event with timing. Usage detail is added by the caller
      // via buildResponse, but the success signal + duration live here where
      // we have the timing context.
      emitEvent({
        type: 'request.success',
        timestamp: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        env: config.env,
        durationMs: Date.now() - start,
        usage: extractUsage(result),
        correlationId,
      })
      return result

    } catch (err) {
      const wrapped = err instanceof AIProviderError ? err : wrapError(err, config.provider)

      if (!isRetryable(wrapped.code)) {
        emitEvent({
          type: 'request.failure',
          timestamp: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          env: config.env,
          durationMs: Date.now() - start,
          error: { code: wrapped.code, message: wrapped.message },
          correlationId,
        })
        throw wrapped
      }

      lastError = wrapped

      if (attempt < 2) {
        const backoff = 500 * Math.pow(2, attempt)
        emitEvent({
          type: 'request.retry',
          timestamp: new Date().toISOString(),
          provider: config.provider,
          model: config.model,
          env: config.env,
          durationMs: Date.now() - start,
          attempt: attempt + 1,
          error: { code: wrapped.code, message: wrapped.message },
          correlationId,
        })
        await new Promise<void>(r => setTimeout(r, backoff))
      }
    }
  }

  // All retries exhausted
  emitEvent({
    type: 'request.failure',
    timestamp: new Date().toISOString(),
    provider: config.provider,
    model: config.model,
    env: config.env,
    durationMs: Date.now() - start,
    error: lastError ? { code: lastError.code, message: lastError.message } : { code: 'UNKNOWN', message: 'exhausted retries' },
    correlationId,
  })
  throw lastError
}

// ─── Internals ────────────────────────────────────────────────────────────────

function buildMessages(
  config: ProviderConfig,
  systemPrompt: string,
  userPrompt: string
): { system: string; messages: ModelMessage[] } {
  if (config.usePromptCache) {
    return {
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
              providerOptions: {
                anthropic: { cacheControl: { type: 'ephemeral' } },
              },
            },
          ],
        },
      ],
    }
  }
  return {
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  }
}

function buildResponse<T>(
  data: T,
  usage: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number; cacheCreationTokens?: number } } | undefined,
  config: ProviderConfig,
  cacheKey?: string
): AIResponse<T> {
  if (cacheKey) responseCache.set(cacheKey, data)

  const cacheReadTokens     = usage?.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheCreationTokens = usage?.inputTokenDetails?.cacheCreationTokens ?? 0

  const response: AIResponse<T> = {
    data,
    usage: usage
      ? {
          inputTokens:  usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cacheReadTokens,
          cacheCreationTokens,
        }
      : undefined,
    provider: config.provider,
    model: config.model,
    fromCache: false,
  }

  logUsageBox(config, response)
  return response
}

/** Extracts a normalised usage object from a generateText result for events. */
function extractUsage(result: unknown): { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number } | undefined {
  const u = (result as { usage?: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number; cacheCreationTokens?: number } } })?.usage
  if (!u) return undefined
  return {
    inputTokens:  u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cacheReadTokens:     u.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheCreationTokens: u.inputTokenDetails?.cacheCreationTokens ?? 0,
  }
}

function logUsageBox<T>(config: ProviderConfig, response: AIResponse<T>): void {
  const isDev    = config.env === 'development'
  const forceLog = process.env.AI_LOG_USAGE === 'true'
  if (!isDev && !forceLog) return

  const u     = response.usage
  const width = 41
  const line = (label: string, value: string) => {
    const content = `  ${label.padEnd(10)} ${value}`
    const pad     = width - content.length - 1
    return `\x1b[2m[ai-provider]\x1b[0m │${content}${' '.repeat(Math.max(0, pad))}│`
  }
  const bar = (char: string) =>
    `\x1b[2m[ai-provider]\x1b[0m ${char}${'─'.repeat(width)}${char === '┌' ? '┐' : '┘'}`

  const lines: string[] = [bar('┌')]
  lines.push(line('provider', `\x1b[36m${config.provider}\x1b[0m \x1b[2m(${config.env})\x1b[0m`))
  lines.push(line('model',    `\x1b[36m${config.model}\x1b[0m`))
  if (u) {
    lines.push(line('tokens', `in: \x1b[33m${u.inputTokens}\x1b[0m  out: \x1b[33m${u.outputTokens}\x1b[0m`))
    if (u.cacheReadTokens > 0) {
      const pct = Math.round((u.cacheReadTokens / u.inputTokens) * 100)
      lines.push(line('cache read', `\x1b[32m${u.cacheReadTokens} tokens (${pct}% of input)\x1b[0m`))
    }
    if (u.cacheCreationTokens > 0) {
      lines.push(line('cache write', `\x1b[35m${u.cacheCreationTokens} tokens\x1b[0m`))
    }
  }
  lines.push(bar('└'))
  lines.forEach(l => console.log(l))
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

function logCacheHitBox(config: ProviderConfig, stats: CacheStats): void {
  const isDev = config.env === 'development'
  const forceLog = process.env.AI_LOG_USAGE === 'true'
  if (!isDev && !forceLog) return
  console.log(`\x1b[2m[ai-provider]\x1b[0m \x1b[32mapp-cache hit\x1b[0m — hitRate ${stats.hitRate}, size ${stats.size}`)
}