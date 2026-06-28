# @jz92/ai-provider

A zero-config AI routing layer for Node.js and Next.js projects.

Import one function — get Ollama locally and any cloud provider in production, automatically, based on `NODE_ENV`. No provider-switching logic in your feature code, ever.

| Environment | Provider | Model | Cost |
|---|---|---|---|
| `development` | Ollama (local) | `qwen2.5-coder:14b` | $0 |
| `test` / CI | Anthropic | `claude-haiku-4-5` | ~$0.001/req |
| `production` | Anthropic | `claude-sonnet-4-6` | ~$0.03/req |

---

## What this is

When building AI-powered features, you typically want:
- **Local dev** → free, fast, no API key, works offline
- **CI** → real API, cheapest model, minimal tokens
- **Production** → best model, prompt caching, cost-optimised

This package handles that routing. You write `generateStructured()` once — the environment decides which provider runs it.

## What this is not

- Not an agent framework
- Not a coding assistant or CLI tool
- Not something that manages Ollama for you

You bring Ollama. This package talks to it.

---

## Quick setup

### 1. Install

```bash
npm install @jz92/ai-provider zod
```

That's it. `ai`, `@ai-sdk/anthropic`, and `@ai-sdk/openai` are bundled as dependencies — no separate installs, no peer dependency warnings, no bundler config.

> Optional providers (Google, Groq, Mistral) install automatically if available.
> If you want to use one explicitly: `npm install @ai-sdk/google` (or groq / mistral).

### 2. Set up Ollama for local dev (first time only)

```bash
brew install ollama
brew services start ollama
ollama pull qwen2.5-coder:14b
curl http://localhost:11434   # → Ollama is running
```

### 3. Set environment variables

```bash
# .env.development  (local — no API key needed)
NODE_ENV=development
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:14b
AI_LOG_USAGE=true

# .env.production   (set as secret in Vercel / AWS — never commit)
ANTHROPIC_API_KEY=sk-ant-...
```

On Vercel, set `ANTHROPIC_API_KEY` in **Project Settings → Environment Variables**.
`NODE_ENV=production` is set automatically.

### 6. Use it

```typescript
import { generateStructured, generatePlainText } from '@jz92/ai-provider'
import { z } from 'zod'

const result = await generateStructured({
  systemPrompt: 'Extract data. Respond in JSON only.',
  prompt: userInput,
  schema: z.object({ name: z.string(), city: z.string() }),
  cacheKey: `extract:${userInput}`,
})

console.log(result.data)        // { name: 'Alex', city: 'London' }
console.log(result.provider)    // 'ollama' locally · 'anthropic' in prod
console.log(result.fromCache)   // true on cache hit
```

Your code is identical in every environment. The provider switches automatically.

---

## Switching cloud providers

Provider selection is controlled by the `AI_PROVIDER` env var. **The API key alone does not switch the provider** — you must set `AI_PROVIDER` explicitly. This is deliberate: it prevents ambiguity when multiple keys are present and keeps you in explicit control of which provider (and price tier) you hit.

Default in production is Anthropic. To use a different provider, set two env vars:

```bash
# .env.production
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

```bash
# Or Groq (free tier, very fast)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...
```

No code changes. Your `generateStructured()` calls are unchanged.

Anthropic and OpenAI work out of the box (bundled as dependencies). For Google, Groq, or Mistral, install the adapter:

```bash
npm install @ai-sdk/groq   # or @ai-sdk/google, @ai-sdk/mistral
```

### Supported providers

| Provider | `AI_PROVIDER` value | Env var | Adapter |
|---|---|---|---|
| Anthropic (default) | `anthropic` | `ANTHROPIC_API_KEY` | bundled |
| OpenAI | `openai` | `OPENAI_API_KEY` | bundled |
| Ollama (local) | `ollama` | — | bundled (via OpenAI-compatible endpoint) |
| Google Gemini | `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `npm install @ai-sdk/google` |
| Groq | `groq` | `GROQ_API_KEY` | `npm install @ai-sdk/groq` |
| Mistral | `mistral` | `MISTRAL_API_KEY` | `npm install @ai-sdk/mistral` |


---

## Usage

### `generateStructured` — typed JSON output

```typescript
import { generateStructured } from '@jz92/ai-provider'
import { z } from 'zod'

const result = await generateStructured({
  systemPrompt: 'You are a data extraction assistant. Respond in JSON only.',
  prompt: 'Extract name and city from: "Hi I am Alex from London"',
  schema: z.object({ name: z.string(), city: z.string() }),
  cacheKey: 'extract:alex',       // optional — repeat calls skip the API
  maxInputTokens: 4000,           // optional — throws if exceeded
})

console.log(result.data)          // { name: 'Alex', city: 'London' }
console.log(result.provider)      // 'ollama' | 'anthropic' | 'openai' ...
console.log(result.fromCache)     // true if served from response cache
console.log(result.usage)         // { inputTokens, outputTokens, cachedTokens }
```

### `generatePlainText` — unstructured text output

```typescript
import { generatePlainText } from '@jz92/ai-provider'

const result = await generatePlainText({
  systemPrompt: 'You are a helpful assistant.',
  prompt: 'Summarise this in one sentence...',
})

console.log(result.data)  // the text response
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Selects default provider: `development`→Ollama, `test`→Haiku, `production`→Sonnet |
| `AI_PROVIDER` | — | Overrides the default. Required to use any non-default provider — a key alone won't switch |
| `AI_MODEL` | — | Force a specific model string |
| `AI_LOG_USAGE` | `false` | Log provider, model, and token usage to console |
| `AI_TIMEOUT_MS` | `60000` (Ollama) / `30000` (cloud) | Request timeout in ms |
| `AI_CACHE_MAX_SIZE` | `500` | Max in-memory cache entries |
| `AI_CACHE_TTL_MS` | `300000` (5 min) | Cache entry TTL |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host |
| `OLLAMA_MODEL` | `qwen2.5-coder:14b` | Local model name |

---

## What's included in the gateway

Every request passes through the gateway regardless of provider:

- **Response cache** — same `cacheKey` skips the API entirely. Bounded at 500 entries, 5 min TTL.
- **Token budget guard** — throws before the API call if input exceeds `maxInputTokens`.
- **Smart retry** — retries only transient errors (429, 500, timeout). Never retries auth or billing failures.
- **Hard timeout** — 60s for Ollama, 30s for cloud. Override with `AI_TIMEOUT_MS`.
- **Prompt caching** — automatically enabled for Anthropic in production. Reduces input costs by ~90% on repeat calls.
- **Usage logging** — formatted terminal output in development showing provider, model, and token counts.

---

## Error handling

```typescript
import { generateStructured, AIProviderError } from '@jz92/ai-provider'

try {
  const result = await generateStructured({ ... })
} catch (err) {
  if (err instanceof AIProviderError) {
    console.error(err.code)    // 'AUTH_ERROR' | 'RATE_LIMIT' | 'TIMEOUT' | etc.
    console.error(err.message) // actionable message with exact steps to fix
  }
}
```

### Error codes

| Code | Cause | Retried? |
|---|---|---|
| `AUTH_ERROR` | Missing or invalid API key | No |
| `BILLING_ERROR` | No credits / quota exceeded | No |
| `RATE_LIMIT` | Too many requests (429) | Yes — with backoff |
| `SERVER_ERROR` | Provider 5xx error | Yes — with backoff |
| `TIMEOUT` | Request exceeded `AI_TIMEOUT_MS` | Yes — once |
| `MODEL_NOT_FOUND` | Model not pulled locally | No |
| `TOKEN_BUDGET` | Input exceeded `maxInputTokens` | No |
| `SCHEMA_VALIDATION` | Output did not match Zod schema | No |

### Ollama not running

```
[ai-provider] Ollama is not reachable at http://localhost:11434.

  Start Ollama:       brew services start ollama
  Or (foreground):    ollama serve

  To use a cloud provider instead:
    Set AI_PROVIDER=anthropic (and ANTHROPIC_API_KEY) in your .env
    Or: AI_PROVIDER=openai    (and OPENAI_API_KEY)
    Or: AI_PROVIDER=groq      (and GROQ_API_KEY — free tier available)
```

### API key not set

```
[ai-provider] ANTHROPIC_API_KEY is not set.

  1. Install the SDK:   npm install @ai-sdk/anthropic
  2. Set the key:
       Local:       add ANTHROPIC_API_KEY=<your-key> to .env.local
       Vercel:      Project Settings → Environment Variables
       AWS:         task definition or Secrets Manager
       GitHub CI:   repo secrets → ${{ secrets.ANTHROPIC_API_KEY }}

  Get a key at: https://console.anthropic.com
```

---

## Architecture

```mermaid
flowchart TD
    A["Your feature code\ngenerateStructured() · generatePlainText()"]
    B["Gateway\ncache · token guard · retry · timeout"]
    C["Provider resolver\nreads NODE_ENV + overrides"]

    D["development\nNODE_ENV=development"]
    E["test / CI\nNODE_ENV=test"]
    F["production\nNODE_ENV=production"]

    G["Ollama\nlocalhost:11434 · free"]
    H["Anthropic · OpenAI\nGoogle · Groq · Mistral"]

    A --> B --> C
    C --> D --> G
    C --> E --> H
    C --> F --> H

    style A fill:#F1EFE8,stroke:#5F5E5A
    style B fill:#EEEDFE,stroke:#534AB7
    style C fill:#EEEDFE,stroke:#534AB7
    style D fill:#E1F5EE,stroke:#0F6E56
    style E fill:#FAEEDA,stroke:#854F0B
    style F fill:#FAECE7,stroke:#993C1D
    style G fill:#E1F5EE,stroke:#0F6E56
    style H fill:#FAECE7,stroke:#993C1D
```

---

## Security

This package reads API keys from environment variables and passes them directly to the provider SDK over HTTPS. Keys are never logged, stored, or transmitted by this package.

- Never commit `.env` or `.env.local` — add both to `.gitignore`
- Never log `process.env` in application code
- Use deployment secrets (Vercel / AWS Secrets Manager) in production
- Rotate keys immediately if accidentally exposed

---

## Running tests

```bash
# Requires Ollama running with qwen2.5-coder:14b pulled
npm test
```

Expected: 27 passed.

---

## Reference implementation

See [portfolio-lab](https://github.com/jithinjohnzachariah92/portfolio-lab) for a working Next.js project using this package across multiple AI-powered features.

---

## Repo

[github.com/jithinjohnzachariah92/ai-provider](https://github.com/jithinjohnzachariah92/ai-provider) · [npmjs.com/package/@jz92/ai-provider](https://www.npmjs.com/package/@jz92/ai-provider)