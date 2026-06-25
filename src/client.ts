/// <reference types="node" />
import type { LanguageModel } from 'ai'
import type { ProviderConfig } from './types.js'

/**
 * Builds a Vercel AI SDK model instance from a ProviderConfig.
 * Returns LanguageModel — the stable interface from the 'ai' package
 * that both Ollama and Anthropic satisfy. Typed explicitly here so the
 * DTS build never tries to reach into peer dep internals.
 *
 * Both providers are imported lazily so the package doesn't crash if one
 * peer dep is absent — e.g. a production deploy without ollama-ai-provider.
 */
export async function buildModel(config: ProviderConfig): Promise<LanguageModel> {
  if (config.provider === 'ollama') {
    return buildOllamaModel(config)
  }
  return buildAnthropicModel(config)
}

async function buildOllamaModel(config: ProviderConfig): Promise<LanguageModel> {
  let createOllama: (typeof import('ollama-ai-provider'))['createOllama']
  try {
    const mod = await import('ollama-ai-provider')
    createOllama = mod.createOllama
  } catch {
    throw new Error(
      '[ai-provider] ollama-ai-provider is not installed.\n' +
      'Run: npm install ollama-ai-provider'
    )
  }

  const ollama = createOllama({
    // ollama-ai-provider uses Ollama's native /api endpoint, not /v1
    baseURL: `${config.baseURL}/api`,
  })
  return ollama(config.model) as LanguageModel
}

async function buildAnthropicModel(config: ProviderConfig): Promise<LanguageModel> {
  const { createAnthropic } = await import('@ai-sdk/anthropic')
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
  return anthropic(config.model) as LanguageModel
}