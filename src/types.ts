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
}

export type AIResponse<T> = {
  data: T
  usage?: {
    inputTokens: number
    outputTokens: number
    /** Provider-side cache token count. Only populated if the provider returns
     *  cache metadata in the response (currently Anthropic via the Vercel AI SDK).
     *  Defaults to 0 for providers that do not yet expose this. */
    cachedTokens: number
  }
  provider: AIProviderName
  model: string
  fromCache: boolean
}
