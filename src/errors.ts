/// <reference types="node" />

/**
 * Error classification for the retry logic.
 * We only retry transient errors — never auth, billing, or validation failures.
 */

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly code: AIErrorCode,
    public readonly provider?: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AIProviderError'
  }
}

export type AIErrorCode =
  | 'AUTH_ERROR'          // 401 — bad key, never retry
  | 'BILLING_ERROR'       // 402/403 — no credits, never retry
  | 'RATE_LIMIT'          // 429 — retry with backoff
  | 'SERVER_ERROR'        // 500/502/503 — retry
  | 'TIMEOUT'             // request hung — retry once
  | 'MODEL_NOT_FOUND'     // 404 — model not pulled locally
  | 'TOKEN_BUDGET'        // input too large — never retry
  | 'SCHEMA_VALIDATION'   // output didn't match schema — retry once
  | 'UNKNOWN'             // anything else

/**
 * Returns true if the error is transient and worth retrying.
 * Auth, billing, and validation errors will never succeed on retry.
 */
export function isRetryable(code: AIErrorCode): boolean {
  return code === 'RATE_LIMIT' || code === 'SERVER_ERROR' || code === 'TIMEOUT'
}

/**
 * Classifies a raw error from the AI SDK or fetch layer into an AIErrorCode.
 */
export function classifyError(err: unknown): AIErrorCode {
  const message = errorMessage(err)
  const status  = extractStatus(err)

  // HTTP status codes — most reliable signal
  if (status === 401)             return 'AUTH_ERROR'
  if (status === 402)             return 'BILLING_ERROR'
  if (status === 403)             return 'BILLING_ERROR'
  if (status === 404)             return 'MODEL_NOT_FOUND'
  if (status === 429)             return 'RATE_LIMIT'
  if (status >= 500 && status < 600) return 'SERVER_ERROR'

  // Message-based fallbacks for when status isn't available
  const lower = message.toLowerCase()
  if (lower.includes('api key') || lower.includes('authentication') || lower.includes('unauthorized'))
    return 'AUTH_ERROR'
  if (lower.includes('credit') || lower.includes('billing') || lower.includes('quota'))
    return 'BILLING_ERROR'
  if (lower.includes('rate limit') || lower.includes('too many requests'))
    return 'RATE_LIMIT'
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout'))
    return 'TIMEOUT'
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('pull')))
    return 'MODEL_NOT_FOUND'
  if (lower.includes('schema') || lower.includes('validation') || lower.includes('parse'))
    return 'SCHEMA_VALIDATION'

  return 'UNKNOWN'
}

/**
 * Wraps a raw error with a clean consumer-facing message.
 */
export function wrapError(err: unknown, provider: string): AIProviderError {
  const code    = classifyError(err)
  const status  = extractStatus(err)
  const message = buildMessage(code, provider, errorMessage(err))
  return new AIProviderError(message, code, provider, status, err)
}

function buildMessage(code: AIErrorCode, provider: string, raw: string): string {
  switch (code) {
    case 'AUTH_ERROR':
      return (
        `[ai-provider] Authentication failed for "${provider}".\n` +
        `Check your API key is set correctly and hasn't expired.\n` +
        `Env var: ${providerKeyName(provider)}`
      )
    case 'BILLING_ERROR':
      return (
        `[ai-provider] Billing or quota issue for "${provider}".\n` +
        `Check your account has active credits at the provider dashboard.`
      )
    case 'RATE_LIMIT':
      return (
        `[ai-provider] Rate limit hit for "${provider}".\n` +
        `Request will be retried with exponential backoff.`
      )
    case 'MODEL_NOT_FOUND':
      return (
        `[ai-provider] Model not found for "${provider}".\n` +
        `If using Ollama locally, run: ollama pull <model-name>\n` +
        `Raw: ${raw}`
      )
    case 'TIMEOUT':
      return (
        `[ai-provider] Request timed out for "${provider}".\n` +
        `Check your network connection and provider status.`
      )
    case 'SCHEMA_VALIDATION':
      return (
        `[ai-provider] Response from "${provider}" did not match the expected schema.\n` +
        `Try making your system prompt more explicit about the output format.\n` +
        `Raw: ${raw}`
      )
    default:
      return `[ai-provider] Unexpected error from "${provider}": ${raw}`
  }
}

function providerKeyName(provider: string): string {
  const keys: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai:    'OPENAI_API_KEY',
    google:    'GOOGLE_GENERATIVE_AI_API_KEY',
    groq:      'GROQ_API_KEY',
    mistral:   'MISTRAL_API_KEY',
  }
  return keys[provider] ?? `${provider.toUpperCase()}_API_KEY`
}

function extractStatus(err: unknown): number {
  if (err && typeof err === 'object') {
    if ('status' in err && typeof (err as { status: unknown }).status === 'number')
      return (err as { status: number }).status
    if ('statusCode' in err && typeof (err as { statusCode: unknown }).statusCode === 'number')
      return (err as { statusCode: number }).statusCode
  }
  return 0
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}
