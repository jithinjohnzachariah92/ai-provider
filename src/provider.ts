/// <reference types="node" />
import type { ProviderConfig, AIProviderName, AIEnvironment } from './types.js'

/**
 * Resolves which AI provider + model to use based on NODE_ENV.
 *
 * Default routing:
 *   development  → Ollama (local, free, no API key)
 *   test         → Anthropic Haiku (cheap, real API, for CI)
 *   production   → Anthropic Sonnet with prompt caching
 *
 * Override anything via env vars:
 *   AI_PROVIDER=openai|anthropic|google|groq|mistral|ollama
 *   AI_MODEL=<model string>
 *   OLLAMA_MODEL=<named variant>
 *   OLLAMA_BASE_URL=<url>
 *
 * Provider-specific defaults when AI_PROVIDER is set:
 *   openai    → gpt-4o-mini (test) / gpt-4o (prod)
 *   google    → gemini-1.5-flash (test) / gemini-1.5-pro (prod)
 *   groq      → llama-3.1-8b-instant (test) / llama-3.1-70b-versatile (prod)
 *   mistral   → mistral-small-latest (test) / mistral-large-latest (prod)
 */
export function resolveProvider(): ProviderConfig {
  const env = resolveEnvironment()
  const providerOverride = process.env.AI_PROVIDER as AIProviderName | undefined
  const modelOverride = process.env.AI_MODEL

  // Explicit provider override
  if (providerOverride && providerOverride !== 'ollama') {
    return buildCloudConfig(providerOverride, env, modelOverride)
  }
  if (providerOverride === 'ollama') {
    return buildOllamaConfig(modelOverride)
  }

  // Environment defaults
  switch (env) {
    case 'development': return buildOllamaConfig(modelOverride)
    case 'test':        return buildCloudConfig('anthropic', 'test', modelOverride)
    case 'production':  return buildCloudConfig('anthropic', 'production', modelOverride)
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

function buildCloudConfig(
  provider: Exclude<AIProviderName, 'ollama'>,
  env: AIEnvironment,
  modelOverride?: string
): ProviderConfig {
  const isTest = env === 'test'

  const defaults: Record<Exclude<AIProviderName, 'ollama'>, { test: string; production: string }> = {
    anthropic: {
      test:       'claude-haiku-4-5-20251001',
      production: 'claude-sonnet-4-6',
    },
    openai: {
      test:       'gpt-4o-mini',
      production: 'gpt-4o',
    },
    google: {
      test:       'gemini-1.5-flash',
      production: 'gemini-1.5-pro',
    },
    groq: {
      test:       'llama-3.1-8b-instant',
      production: 'llama-3.1-70b-versatile',
    },
    mistral: {
      test:       'mistral-small-latest',
      production: 'mistral-large-latest',
    },
  }

  return {
    provider,
    model: modelOverride ?? defaults[provider][isTest ? 'test' : 'production'],
    maxTokens: isTest ? 512 : 1024,
    // Only Anthropic supports prompt caching via this SDK
    usePromptCache: provider === 'anthropic' && !isTest,
    env,
  }
}
