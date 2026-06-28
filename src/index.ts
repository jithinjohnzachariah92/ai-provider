/**
 * @jz92/ai-provider
 *
 * Environment-aware AI provider for Next.js / Node portfolio projects.
 *
 * - development  → Ollama (local, free)
 * - test         → Anthropic Haiku (CI, minimal cost)
 * - production   → Anthropic Sonnet with prompt caching
 *
 * Usage:
 *   import { generateStructured, generatePlainText } from '@jz92/ai-provider'
 */

export { generateStructured, generatePlainText } from './gateway.js'
export { resolveProvider } from './provider.js'
export { responseCache } from './cache.js'
export { AIProviderError } from './errors.js'
export { onAIEvent } from './observability.js'
export type { AIErrorCode } from './errors.js'
export type { AIEvent, AIEventType } from './observability.js'
export type {
  AIResponse,
  AIRequestOptions,
  ProviderConfig,
  AIProviderName,
  AIEnvironment,
} from './types.js'