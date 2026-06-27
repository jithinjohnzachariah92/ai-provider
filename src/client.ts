/// <reference types="node" />
import type { LanguageModel } from 'ai'
import type { ProviderConfig } from './types.js'
import { AIProviderError } from './errors.js'

/**
 * Builds a Vercel AI SDK model instance from a ProviderConfig.
 *
 * Guards:
 *  - Ollama unreachable → clear message + how to fix or override
 *  - No API key set     → clear message naming the exact env var needed
 *  - SDK not installed  → clear message with the exact install command
 *
 * Supported providers:
 *   ollama      ollama-ai-provider          OLLAMA_BASE_URL (optional)
 *   anthropic   @ai-sdk/anthropic           ANTHROPIC_API_KEY
 *   openai      @ai-sdk/openai              OPENAI_API_KEY
 *   google      @ai-sdk/google              GOOGLE_GENERATIVE_AI_API_KEY
 *   groq        @ai-sdk/groq                GROQ_API_KEY
 *   mistral     @ai-sdk/mistral             MISTRAL_API_KEY
 */
export async function buildModel(config: ProviderConfig): Promise<LanguageModel> {
  switch (config.provider) {
    case 'ollama':    return buildOllamaModel(config)
    case 'anthropic': return buildAnthropicModel(config)
    case 'openai':    return buildOpenAIModel(config)
    case 'google':    return buildGoogleModel(config)
    case 'groq':      return buildGroqModel(config)
    case 'mistral':   return buildMistralModel(config)
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

async function buildOllamaModel(config: ProviderConfig): Promise<LanguageModel> {
  await assertOllamaReachable(config.baseURL ?? 'http://localhost:11434')

  try {
    // Use @ai-sdk/openai pointed at Ollama's OpenAI-compatible /v1 endpoint.
    // Import as namespace to handle both ESM named export and CJS default shapes.
    const openaiMod = await import('@ai-sdk/openai')
    const createOpenAI = openaiMod.createOpenAI
    const ollama = createOpenAI({
      baseURL: `${config.baseURL}/v1`,
      apiKey: 'ollama', // required field, not validated by Ollama
    })
    return ollama(config.model) as LanguageModel
  } catch (err) {
    if (err instanceof AIProviderError) throw err
    if (isModuleNotFound(err)) {
      throw new AIProviderError(
        '[ai-provider] @ai-sdk/openai is not installed.\nRun: npm install @ai-sdk/openai',
        'UNKNOWN', 'ollama'
      )
    }
    throw err
  }
}

async function assertOllamaReachable(baseURL: string): Promise<void> {
  try {
    const res = await fetch(baseURL, { signal: AbortSignal.timeout(3000) })
    if (!res.ok && res.status !== 200) throw new Error(`status ${res.status}`)
  } catch {
    throw new AIProviderError(
      `[ai-provider] Ollama is not reachable at ${baseURL}.\n\n` +
      `  Start Ollama:       brew services start ollama\n` +
      `  Or (foreground):    ollama serve\n\n` +
      `  To use a cloud provider instead:\n` +
      `    Set AI_PROVIDER=anthropic (and ANTHROPIC_API_KEY) in your .env\n` +
      `    Or: AI_PROVIDER=openai (and OPENAI_API_KEY)\n` +
      `    Or: AI_PROVIDER=groq   (and GROQ_API_KEY — free tier available)`,
      'UNKNOWN',
      'ollama'
    )
  }
}

// ─── Cloud providers ──────────────────────────────────────────────────────────

async function buildAnthropicModel(config: ProviderConfig): Promise<LanguageModel> {
  assertKey('ANTHROPIC_API_KEY', 'anthropic', '@ai-sdk/anthropic')
  try {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return anthropic(config.model) as LanguageModel
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled('@ai-sdk/anthropic')
    throw err
  }
}

async function buildOpenAIModel(config: ProviderConfig): Promise<LanguageModel> {
  assertKey('OPENAI_API_KEY', 'openai', '@ai-sdk/openai')
  try {
    const { createOpenAI } = await import('@ai-sdk/openai')
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai(config.model) as LanguageModel
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled('@ai-sdk/openai')
    throw err
  }
}

async function buildGoogleModel(config: ProviderConfig): Promise<LanguageModel> {
  assertKey('GOOGLE_GENERATIVE_AI_API_KEY', 'google', '@ai-sdk/google')
  try {
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
    return google(config.model) as LanguageModel
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled('@ai-sdk/google')
    throw err
  }
}

async function buildGroqModel(config: ProviderConfig): Promise<LanguageModel> {
  assertKey('GROQ_API_KEY', 'groq', '@ai-sdk/groq')
  try {
    const { createGroq } = await import('@ai-sdk/groq')
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })
    return groq(config.model) as LanguageModel
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled('@ai-sdk/groq')
    throw err
  }
}

async function buildMistralModel(config: ProviderConfig): Promise<LanguageModel> {
  assertKey('MISTRAL_API_KEY', 'mistral', '@ai-sdk/mistral')
  try {
    const { createMistral } = await import('@ai-sdk/mistral')
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY })
    return mistral(config.model) as LanguageModel
  } catch (err) {
    if (isModuleNotFound(err)) notInstalled('@ai-sdk/mistral')
    throw err
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Throws a clear error if the required API key env var is not set.
 * Named so the error message tells the consumer exactly what to do.
 */
function assertKey(envVar: string, provider: string, pkg: string): void {
  if (!process.env[envVar]) {
    throw new AIProviderError(
      `[ai-provider] ${envVar} is not set.\n\n` +
      `  This is required for the "${provider}" provider.\n\n` +
      `  1. Install the SDK:   npm install ${pkg}\n` +
      `  2. Set the key:\n` +
      `       Local:       add ${envVar}=<your-key> to .env.local\n` +
      `       Vercel:      add it in Project Settings → Environment Variables\n` +
      `       AWS:         add it to your task definition or Secrets Manager\n` +
      `       GitHub CI:   add it to repo secrets and reference as \${{ secrets.${envVar} }}\n\n` +
      `  Get a key at: ${providerDashboard(provider)}`,
      'AUTH_ERROR',
      provider
    )
  }
}

function notInstalled(pkg: string): never {
  throw new AIProviderError(
    `[ai-provider] ${pkg} is not installed.\nRun: npm install ${pkg}`,
    'UNKNOWN'
  )
}

function isModuleNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    ('code' in err) &&
    (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND'
  )
}

function providerDashboard(provider: string): string {
  const dashboards: Record<string, string> = {
    anthropic: 'https://console.anthropic.com',
    openai:    'https://platform.openai.com/api-keys',
    google:    'https://aistudio.google.com/app/apikey',
    groq:      'https://console.groq.com/keys',
    mistral:   'https://console.mistral.ai/api-keys',
  }
  return dashboards[provider] ?? `https://${provider}.com`
}