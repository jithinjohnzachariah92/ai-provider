/// <reference types="node" />
import type { ProviderConfig, AIEnvironment } from './types.js'

/**
 * Resolves which AI provider + model to use based on NODE_ENV.
 *
 * development  → Ollama (local, free, no API key)
 * test         → Anthropic Haiku (cheap, real API, for CI)
 * production   → Anthropic Sonnet with prompt caching
 *
 * Env var overrides (all optional):
 *   AI_PROVIDER=ollama|anthropic   force a provider regardless of NODE_ENV
 *   AI_MODEL=<model-string>        force a specific model
 *   OLLAMA_MODEL=<name>            local model name (e.g. a named Modelfile variant)
 *   OLLAMA_BASE_URL=<url>          default: http://localhost:11434
 */
export function resolveProvider(): ProviderConfig {
  const env = resolveEnvironment()
  const providerOverride = process.env.AI_PROVIDER as 'ollama' | 'anthropic' | undefined
  const modelOverride = process.env.AI_MODEL

  if (providerOverride === 'anthropic') return buildAnthropicConfig(env, modelOverride)
  if (providerOverride === 'ollama') return buildOllamaConfig(modelOverride)

  switch (env) {
    case 'development': return buildOllamaConfig(modelOverride)
    case 'test':        return buildAnthropicConfig('test', modelOverride)
    case 'production':  return buildAnthropicConfig('production', modelOverride)
  }
}

function resolveEnvironment(): AIEnvironment {
  const raw = process.env.NODE_ENV
  if (raw === 'test') return 'test'
  if (raw === 'production') return 'production'
  return 'development'
}

function buildOllamaConfig(modelOverride?: string): ProviderConfig {
  return {
    provider: 'ollama',
    model: modelOverride ?? process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:14b',
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    maxTokens: 2048,
    usePromptCache: false,
    env: 'development',
  }
}

function buildAnthropicConfig(env: AIEnvironment, modelOverride?: string): ProviderConfig {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      '[ai-provider] ANTHROPIC_API_KEY is not set.\n' +
      'Add it to .env.local for cloud testing, or to your deployment secrets.\n' +
      'For local dev without a key, ensure NODE_ENV=development (uses Ollama).'
    )
  }

  if (env === 'test') {
    return {
      provider: 'anthropic',
      model: modelOverride ?? 'claude-haiku-4-5-20251001',
      maxTokens: 512,
      usePromptCache: false,
      env: 'test',
    }
  }

  return {
    provider: 'anthropic',
    model: modelOverride ?? 'claude-sonnet-4-6',
    maxTokens: 1024,
    usePromptCache: true,
    env: 'production',
  }
}
