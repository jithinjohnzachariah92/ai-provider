#!/usr/bin/env node

const reset  = '\x1b[0m'
const bold   = '\x1b[1m'
const cyan   = '\x1b[36m'
const yellow = '\x1b[33m'
const green  = '\x1b[32m'
const dim    = '\x1b[2m'

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

${bold}Local dev with Ollama:${reset}
  ${dim}Ollama uses @ai-sdk/openai pointed at localhost:11434/v1${reset}
  ${dim}No extra package needed — just install Ollama and pull a model:${reset}
  ${cyan}brew install ollama && ollama pull qwen2.5-coder:14b${reset}

${bold}Set NODE_ENV in your .env:${reset}
  ${dim}development${reset}  → Ollama (free, local)
  ${dim}test${reset}         → cheapest cloud model  (CI)
  ${dim}production${reset}   → best cloud model      (deployed)

${green}Docs: https://github.com/jithinjohnzachariah92/ai-provider (npm: @jz92/ai-provider)${reset}
`)