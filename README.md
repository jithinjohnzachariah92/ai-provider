# @jithin/ai-provider

Environment-aware AI provider for Next.js and Node portfolio projects.

| Environment | Provider | Model | Cost |
|---|---|---|---|
| `development` | Ollama (local) | `qwen2.5-coder:14b` | $0 |
| `test` / CI | Anthropic | `claude-haiku-4-5` | ~$0.001/req |
| `production` | Anthropic | `claude-sonnet-4-6` | ~$0.03/req |

Your feature code never makes provider decisions — it just calls `generateStructured()`.
The environment handles the rest.

---

## Installation

```bash
# In your portfolio project
npm install @jithin/ai-provider

# Peer deps
npm install ai @ai-sdk/anthropic zod

# Local dev only
npm install ollama-ai-provider
```

---

## Usage

```typescript
import { generateStructured, generatePlainText } from '@jithin/ai-provider'
import { z } from 'zod'

// Structured output (NL2Mongo, Preference Parser, etc.)
const result = await generateStructured({
  systemPrompt: MY_SYSTEM_PROMPT,   // your stable prompt — cached in prod
  prompt: userInput,                 // dynamic user input
  schema: z.object({ name: z.string(), age: z.number() }),
  cacheKey: `parse:${userInput}`,   // optional — skips API on repeat calls
})

console.log(result.data)         // { name: 'Jithin', age: 32 }
console.log(result.provider)     // 'ollama' locally, 'anthropic' in prod
console.log(result.fromCache)    // true on cache hit

// Plain text
const text = await generatePlainText({
  systemPrompt: 'You are a helpful assistant.',
  prompt: 'Summarise this order history...',
})
```

---

## Local setup

```bash
# First time only — pulls Ollama models
npx @jithin/ai-provider setup
# or: bash node_modules/@jithin/ai-provider/scripts/setup-local.sh
```

### Project-specific model variants

Create a `modelfiles/` folder in your project root and copy
`node_modules/@jithin/ai-provider/modelfiles-template/Modelfile.template`.
The setup script picks these up automatically.

```
your-project/
  modelfiles/
    Modelfile.nl2mongo          ← your domain-specific Ollama variant
    Modelfile.preference-parser
```

Set `OLLAMA_MODEL=nl2mongo` in `.env.development` to use it.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | Drives provider selection |
| `ANTHROPIC_API_KEY` | prod/test only | — | Anthropic auth |
| `OLLAMA_BASE_URL` | no | `http://localhost:11434` | Ollama host |
| `OLLAMA_MODEL` | no | `qwen2.5-coder:14b` | Local model name |
| `AI_PROVIDER` | no | — | Force `ollama` or `anthropic` |
| `AI_MODEL` | no | — | Force a specific model string |
| `AI_LOG_USAGE` | no | `false` | Log token usage to console |

### `.env.development` (commit the `.example`, not the real file)

```bash
NODE_ENV=development
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:14b
AI_LOG_USAGE=true
```

### Vercel / AWS

Set one secret: `ANTHROPIC_API_KEY`. `NODE_ENV=production` is automatic.

---

## Architecture

```
your feature code
  └── generateStructured() / generatePlainText()
        └── gateway.ts      cache · token guard · retry · prompt cache headers
              └── provider.ts   NODE_ENV → ProviderConfig
                    └── client.ts   ProviderConfig → model instance
                          ├── Ollama  (local dev)
                          └── Anthropic  (test + production)
```

---

## Publishing (when you're ready)

```bash
npm run build        # compiles src/ → dist/
npm publish --access public
```

Consumers install with `npm install @jithin/ai-provider`.
