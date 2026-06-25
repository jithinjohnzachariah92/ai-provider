/**
 * @jithin/ai-provider
 *
 * Environment-aware AI provider for Next.js / Node portfolio projects.
 *
 * - development  → Ollama (local, free)
 * - test         → Anthropic Haiku (CI, minimal cost)
 * - production   → Anthropic Sonnet with prompt caching
 *
 * Usage:
 *   import { generateStructured, generatePlainText } from '@jithin/ai-provider'
 */

export { generateStructured, generatePlainText } from './gateway.js'
export { resolveProvider } from './provider.js'
export type { AIResponse, AIRequestOptions, ProviderConfig, AIProviderName, AIEnvironment } from './types.js'
