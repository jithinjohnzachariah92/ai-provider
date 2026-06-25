/// <reference types="node" />

/**
 * Smoke test — run before pushing.
 *
 * Tests the full chain locally against Ollama.
 * No API key needed. Requires Ollama running on :11434.
 *
 * Run: npm test
 */

import { z } from 'zod'
import { generateStructured, generatePlainText, resolveProvider } from '../src/index.js'

const PASS = '✓'
const FAIL = '✗'

let passed = 0
let failed = 0

function log(ok: boolean, label: string, detail?: string) {
  if (ok) {
    console.log(`  ${PASS}  ${label}`)
    passed++
  } else {
    console.error(`  ${FAIL}  ${label}${detail ? `\n     ${detail}` : ''}`)
    failed++
  }
}

// ── 1. Provider resolves correctly ───────────────────────────────────────────

console.log('\nProvider resolution')

const config = resolveProvider()
log(config.provider === 'ollama', 'resolves to ollama in development')
log(config.usePromptCache === false, 'prompt cache off locally')
log(typeof config.model === 'string', `model is set (${config.model})`)
log(config.baseURL === 'http://localhost:11434', `baseURL is localhost (${config.baseURL})`)

// ── 2. Ollama is reachable ────────────────────────────────────────────────────

console.log('\nOllama connectivity')

try {
  const res = await fetch('http://localhost:11434')
  log(res.ok || res.status === 200, 'Ollama responding on :11434')
} catch {
  log(false, 'Ollama responding on :11434', 'Is Ollama running? Try: ollama serve')
  console.error('\n  Cannot reach Ollama — skipping model tests.\n')
  process.exit(1)
}

// ── 3. Plain text generation ──────────────────────────────────────────────────

console.log('\nPlain text generation')

try {
  const result = await generatePlainText({
    systemPrompt: 'You are a helpful assistant. Keep answers to one sentence.',
    prompt: 'What is 2 + 2?',
    cacheKey: 'smoke:plaintext',
  })

  log(typeof result.data === 'string' && result.data.length > 0, 'returns non-empty string')
  log(result.provider === 'ollama', `provider is ollama (got: ${result.provider})`)
  log(result.fromCache === false, 'first call not from cache')
  console.log(`     response: "${result.data.slice(0, 80)}..."`)
} catch (err) {
  log(false, 'plain text generation', String(err))
}

// ── 4. Cache hit on repeat call ───────────────────────────────────────────────

console.log('\nResponse cache')

try {
  const second = await generatePlainText({
    systemPrompt: 'You are a helpful assistant.',
    prompt: 'What is 2 + 2?',
    cacheKey: 'smoke:plaintext', // same key as above
  })

  log(second.fromCache === true, 'second call returns from cache')
} catch (err) {
  log(false, 'cache hit', String(err))
}

// ── 5. Structured output ──────────────────────────────────────────────────────

console.log('\nStructured output (generateStructured)')

const PersonSchema = z.object({
  name: z.string(),
  city: z.string(),
})

try {
  const result = await generateStructured({
    systemPrompt: 'Extract structured data from text. Respond only in JSON matching the schema.',
    prompt: 'My name is Jithin and I live in Maidenhead.',
    schema: PersonSchema,
    cacheKey: 'smoke:structured',
  })

  log(typeof result.data.name === 'string', `name extracted (got: "${result.data.name}")`)
  log(typeof result.data.city === 'string', `city extracted (got: "${result.data.city}")`)
  log(result.provider === 'ollama', 'provider is ollama')
} catch (err) {
  log(false, 'structured output', String(err))
}

// ── 6. Token budget guard ─────────────────────────────────────────────────────

console.log('\nToken budget guard')

try {
  await generatePlainText({
    systemPrompt: 'x'.repeat(40000), // ~10k tokens — way over default 8k
    prompt: 'hello',
    maxInputTokens: 100,
  })
  log(false, 'throws when input exceeds budget')
} catch (err) {
  log(String(err).includes('token budget'), 'throws when input exceeds budget')
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`  ${passed} passed  ${failed > 0 ? `${failed} failed` : ''}`)
console.log(`${'─'.repeat(40)}\n`)

if (failed > 0) process.exit(1)