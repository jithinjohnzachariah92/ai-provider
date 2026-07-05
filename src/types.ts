export type AIProviderName = 'ollama' | 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral'

export type AIEnvironment = 'development' | 'test' | 'production'

export type ProviderConfig = {
  provider: AIProviderName
  model: string
  baseURL?: string
  maxTokens: number
  usePromptCache: boolean
  env: AIEnvironment
}

export type AIRequestOptions<T = string> = {
  /** The user-facing prompt — the dynamic part of every request */
  prompt: string
  /** Stable system instructions — cached in production (Anthropic), baked into Modelfile locally */
  systemPrompt: string
  /** Zod schema for structured output. Required for generateStructured(). */
  schema?: import('zod').ZodSchema<T>
  /** Deterministic key — same key returns cached result without hitting the API */
  cacheKey?: string
  /** Rough token ceiling on input. Throws before the API call if exceeded. Default 8000. */
  maxInputTokens?: number
  /** Optional correlation ID for tracing this request across services in your logs */
  correlationId?: string
}

export type AIResponse<T> = {
  data: T
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheCreationTokens: number
  }
  provider: AIProviderName
  model: string
  fromCache: boolean
}