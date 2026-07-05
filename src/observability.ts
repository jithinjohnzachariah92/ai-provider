/// <reference types="node" />

import { CacheStats } from "./cache.js"

/**
 * Observability layer.
 *
 * The package emits structured events for every request. Consumers register
 * a single handler to forward these to their observability stack (Datadog,
 * CloudWatch, Sentry, Pino, etc). The package never decides where logs go.
 *
 * Usage in the consumer app (once, at startup):
 *
 *   import { onAIEvent } from '@jz92/ai-provider'
 *
 *   onAIEvent((event) => {
 *     // forward to your logger / APM
 *     logger.info({ source: 'ai-provider', ...event })
 *   })
 *
 * If no handler is registered, events are logged to console in development
 * (formatted) and emitted as structured JSON in production.
 */

export type AIEventType =
  | 'request.success'
  | 'request.failure'
  | 'request.retry'
  | 'cache.hit'

export type AIEvent = {
  type: AIEventType
  timestamp: string          // ISO 8601
  provider: string
  model: string
  env: string
  durationMs?: number
  /** present on success */
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }
  /** present on failure */
  error?: { code: string; message: string }
  /** present on retry */
  attempt?: number
  /** caller-supplied correlation id for tracing across services */
  correlationId?: string
  cacheStats?: CacheStats
}

type AIEventHandler = (event: AIEvent) => void

// Store the handler on globalThis rather than a module-level variable.
// Next.js (and other bundlers) can load this module in separate bundle
// contexts — instrumentation runtime vs API route — each with its own
// module scope. A module-level variable would not be shared across them.
// globalThis is shared across all bundles in the same process.
const GLOBAL_KEY = '__aiProviderEventHandler__'

type GlobalWithHandler = typeof globalThis & {
  [GLOBAL_KEY]?: AIEventHandler | null
}

/**
 * Register a handler for all AI provider events.
 * Call once at app startup. Replaces any previously registered handler.
 */
export function onAIEvent(fn: AIEventHandler): void {
  (globalThis as GlobalWithHandler)[GLOBAL_KEY] = fn
}

/**
 * Emit an event. Called internally by the gateway.
 * Falls back to console if no handler is registered.
 */
export function emitEvent(event: AIEvent): void {
  const handler = (globalThis as GlobalWithHandler)[GLOBAL_KEY]

  if (handler) {
    try {
      handler(event)
    } catch (err) {
      console.error('[ai-provider] event handler threw:', err)
    }
    return
  }

  // Default behaviour when no handler registered
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({ source: 'ai-provider', ...event }))
  } else if (event.type === 'request.failure') {
    console.error(
      `[ai-provider] ${event.error?.code} after ${event.durationMs}ms ` +
      `(${event.provider}/${event.model}): ${event.error?.message}`
    )
  }
}