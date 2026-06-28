/// <reference types="node" />

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
  usage?: { inputTokens: number; outputTokens: number; cachedTokens: number }
  /** present on failure */
  error?: { code: string; message: string }
  /** present on retry */
  attempt?: number
  /** caller-supplied correlation id for tracing across services */
  correlationId?: string
}

type AIEventHandler = (event: AIEvent) => void

let handler: AIEventHandler | null = null

/**
 * Register a handler for all AI provider events.
 * Call once at app startup. Replaces any previously registered handler.
 */
export function onAIEvent(fn: AIEventHandler): void {
  handler = fn
}

/**
 * Emit an event. Called internally by the gateway.
 * Falls back to console if no handler is registered.
 */
export function emitEvent(event: AIEvent): void {
  if (handler) {
    try {
      handler(event)
    } catch (err) {
      // A broken handler must never break the actual request
      console.error('[ai-provider] event handler threw:', err)
    }
    return
  }

  // Default behaviour when no handler registered
  if (process.env.NODE_ENV === 'production') {
    // Structured JSON — parseable by log aggregators
    console.log(JSON.stringify({ source: 'ai-provider', ...event }))
  }
  // In development the formatted box logger (in gateway) handles display,
  // so we stay quiet here to avoid duplicate output — except for failures,
  // which always deserve visibility.
  else if (event.type === 'request.failure') {
    console.error(
      `[ai-provider] ${event.error?.code} after ${event.durationMs}ms ` +
      `(${event.provider}/${event.model}): ${event.error?.message}`
    )
  }
}
