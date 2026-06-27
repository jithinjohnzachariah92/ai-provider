#!/usr/bin/env node

// Runs after npm install — prints a clear setup guide
// so consumers know exactly which peer deps to install.

const reset  = '\x1b[0m'
const bold   = '\x1b[1m'
const cyan   = '\x1b[36m'
const yellow = '\x1b[33m'
const green  = '\x1b[32m'
const dim    = '\x1b[2m'

console.log(`
${bold}@jithin/ai-provider${reset} installed successfully.

${yellow}Next: install the provider adapters you need.${reset}

${bold}Local dev (Ollama — free, no API key):${reset}
  ${cyan}npm install ollama-ai-provider${reset}
  ${dim}Then: brew install ollama && ollama pull qwen2.5-coder:14b${reset}

${bold}Cloud providers (install only what you use):${reset}
  ${cyan}npm install @ai-sdk/anthropic${reset}   ${dim}→ ANTHROPIC_API_KEY   https://console.anthropic.com${reset}
  ${cyan}npm install @ai-sdk/openai${reset}       ${dim}→ OPENAI_API_KEY      https://platform.openai.com/api-keys${reset}
  ${cyan}npm install @ai-sdk/google${reset}       ${dim}→ GOOGLE_GENERATIVE_AI_API_KEY  https://aistudio.google.com${reset}
  ${cyan}npm install @ai-sdk/groq${reset}         ${dim}→ GROQ_API_KEY        https://console.groq.com/keys${reset}
  ${cyan}npm install @ai-sdk/mistral${reset}      ${dim}→ MISTRAL_API_KEY     https://console.mistral.ai${reset}

${bold}Required in all cases:${reset}
  ${cyan}npm install ai zod${reset}

${bold}Set NODE_ENV in your .env:${reset}
  ${dim}development${reset}  → Ollama (free, local)
  ${dim}test${reset}         → cheapest cloud model  (CI)
  ${dim}production${reset}   → best cloud model      (deployed)

${green}Docs: https://github.com/jithinjohnzachariah92/ai-provider${reset}
`)