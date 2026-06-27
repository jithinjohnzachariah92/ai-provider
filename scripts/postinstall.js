#!/usr/bin/env node

const reset  = '\x1b[0m'
const bold   = '\x1b[1m'
const cyan   = '\x1b[36m'
const yellow = '\x1b[33m'
const green  = '\x1b[32m'
const dim    = '\x1b[2m'
const red    = '\x1b[31m'

console.log(`
${bold}@jz92/ai-provider${reset} installed successfully.

${yellow}Next: install the provider adapters you need.${reset}

${bold}Always required:${reset}
  ${cyan}npm install ai zod${reset}

${bold}Cloud providers — install only what you use:${reset}
  ${cyan}npm install @ai-sdk/anthropic${reset}   ${dim}→ ANTHROPIC_API_KEY   https://console.anthropic.com${reset}
  ${cyan}npm install @ai-sdk/openai${reset}       ${dim}→ OPENAI_API_KEY      https://platform.openai.com/api-keys${reset}
  ${cyan}npm install @ai-sdk/google${reset}       ${dim}→ GOOGLE_GENERATIVE_AI_API_KEY  https://aistudio.google.com${reset}
  ${cyan}npm install @ai-sdk/groq${reset}         ${dim}→ GROQ_API_KEY        https://console.groq.com/keys${reset}
  ${cyan}npm install @ai-sdk/mistral${reset}      ${dim}→ MISTRAL_API_KEY     https://console.mistral.ai${reset}

${bold}Local dev with Ollama (devDependency — not for production):${reset}
  ${cyan}npm install ollama-ai-provider --save-dev --legacy-peer-deps${reset}
  ${dim}Then: brew install ollama && ollama pull qwen2.5-coder:14b${reset}

  ${red}Note:${reset} ollama-ai-provider@1.2.0 conflicts with zod@4.
  ${dim}--legacy-peer-deps is required until ollama-ai-provider updates.${reset}
  ${dim}This does not affect production builds — devDependencies are excluded on Vercel/AWS.${reset}

${bold}Set NODE_ENV in your .env:${reset}
  ${dim}development${reset}  → Ollama (free, local)
  ${dim}test${reset}         → cheapest cloud model  (CI)
  ${dim}production${reset}   → best cloud model      (deployed)

${green}Docs: https://github.com/jithinjohnzachariah92/ai-provider (npm: @jz92/ai-provider)${reset}
`)