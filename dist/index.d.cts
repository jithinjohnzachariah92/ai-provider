import * as zod from 'zod';
import { ZodSchema } from 'zod';

type AIProviderName = 'ollama' | 'anthropic';
type AIEnvironment = 'development' | 'test' | 'production';
type ProviderConfig = {
    provider: AIProviderName;
    model: string;
    baseURL?: string;
    maxTokens: number;
    usePromptCache: boolean;
    env: AIEnvironment;
};
type AIRequestOptions<T = string> = {
    /** The user-facing prompt — the dynamic part of every request */
    prompt: string;
    /** Stable system instructions — cached in production, baked into Modelfile locally */
    systemPrompt: string;
    /** Zod schema for structured output. Required for generateStructured(). */
    schema?: zod.ZodSchema<T>;
    /** Deterministic key — same key returns cached result without hitting the API */
    cacheKey?: string;
    /** Rough token ceiling on input. Throws before the API call if exceeded. Default 8000. */
    maxInputTokens?: number;
};
type AIResponse<T> = {
    data: T;
    usage?: {
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
    };
    provider: AIProviderName;
    model: string;
    fromCache: boolean;
};

/**
 * generateStructured
 * Use when you need typed, validated JSON output.
 * Requires a Zod schema. Throws on schema validation failure (retried up to 2x).
 *
 * @example
 * const result = await generateStructured({
 *   systemPrompt: MY_SYSTEM_PROMPT,
 *   prompt: userInput,
 *   schema: z.object({ name: z.string() }),
 *   cacheKey: `parse:${userInput}`,
 * })
 * console.log(result.data.name)
 */
declare function generateStructured<T>(options: AIRequestOptions<T> & {
    schema: ZodSchema<T>;
}): Promise<AIResponse<T>>;
/**
 * generatePlainText
 * Use for non-structured outputs — summaries, rewrites, chat responses.
 */
declare function generatePlainText(options: Omit<AIRequestOptions, 'schema'>): Promise<AIResponse<string>>;

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
declare function resolveProvider(): ProviderConfig;

export { type AIEnvironment, type AIProviderName, type AIRequestOptions, type AIResponse, type ProviderConfig, generatePlainText, generateStructured, resolveProvider };
