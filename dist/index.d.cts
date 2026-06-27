import * as zod from 'zod';
import { ZodSchema } from 'zod';

type AIProviderName = 'ollama' | 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral';
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
    /** Stable system instructions — cached in production (Anthropic), baked into Modelfile locally */
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
 * generateStructured — typed, validated JSON output.
 *
 * @example
 * const result = await generateStructured({
 *   systemPrompt: MY_SYSTEM_PROMPT,
 *   prompt: userInput,
 *   schema: z.object({ name: z.string() }),
 *   cacheKey: `parse:${userInput}`,
 * })
 */
declare function generateStructured<T>(options: AIRequestOptions<T> & {
    schema: ZodSchema<T>;
}): Promise<AIResponse<T>>;
/**
 * generatePlainText — unstructured text output.
 */
declare function generatePlainText(options: Omit<AIRequestOptions, 'schema'>): Promise<AIResponse<string>>;

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
declare function resolveProvider(): ProviderConfig;

declare class BoundedCache {
    private store;
    private readonly maxSize;
    private readonly ttlMs;
    constructor(maxSize?: number, ttlMs?: number);
    get<T>(key: string): T | null;
    set<T>(key: string, value: T): void;
    delete(key: string): void;
    /** Clear all entries — useful between tests */
    clear(): void;
    get size(): number;
}
declare const responseCache: BoundedCache;

/**
 * Error classification for the retry logic.
 * We only retry transient errors — never auth, billing, or validation failures.
 */
declare class AIProviderError extends Error {
    readonly code: AIErrorCode;
    readonly provider?: string | undefined;
    readonly status?: number | undefined;
    readonly cause?: unknown | undefined;
    constructor(message: string, code: AIErrorCode, provider?: string | undefined, status?: number | undefined, cause?: unknown | undefined);
}
type AIErrorCode = 'AUTH_ERROR' | 'BILLING_ERROR' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'TIMEOUT' | 'MODEL_NOT_FOUND' | 'TOKEN_BUDGET' | 'SCHEMA_VALIDATION' | 'UNKNOWN';

export { type AIEnvironment, type AIErrorCode, AIProviderError, type AIProviderName, type AIRequestOptions, type AIResponse, type ProviderConfig, generatePlainText, generateStructured, resolveProvider, responseCache };
