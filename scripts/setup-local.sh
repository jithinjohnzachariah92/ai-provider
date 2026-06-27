#!/bin/bash
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  @jithin/ai-provider — Local Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check Ollama ──────────────────────────────────────────────────────────────
if ! command -v ollama &> /dev/null; then
  echo "✗ Ollama not found."
  echo "  Install: brew install ollama"
  echo "  Or:      https://ollama.com/download"
  exit 1
fi
echo "✓ Ollama installed"

# ── Start Ollama if not already running ──────────────────────────────────────
if ! curl -s http://localhost:11434 > /dev/null 2>&1; then
  echo "→ Starting Ollama daemon..."
  ollama serve > /dev/null 2>&1 &
  sleep 3
fi
echo "✓ Ollama running at http://localhost:11434"

# ── Pull base model ───────────────────────────────────────────────────────────
echo ""
echo "→ Pulling qwen2.5-coder:14b (skip if already present)..."
ollama pull qwen2.5-coder:14b
echo "✓ Base model ready"

# ── Optional: pull embedding model for semantic cache ─────────────────────────
echo ""
echo "→ Pulling nomic-embed-text (used for semantic response cache)..."
ollama pull nomic-embed-text
echo "✓ Embedding model ready"

# ── Build project-specific model variants ────────────────────────────────────
# Looks for Modelfile.* in a ./modelfiles directory at the project root.
# Projects copy modelfiles-template/Modelfile.template and customise it.
MODELFILES_DIR="$(pwd)/modelfiles"

if [ -d "$MODELFILES_DIR" ]; then
  echo ""
  echo "→ Building project model variants from ./modelfiles/..."
  for f in "$MODELFILES_DIR"/Modelfile.*; do
    name="${f##*.}"   # extracts the part after the last dot
    echo "  ollama create $name"
    ollama create "$name" -f "$f"
  done
  echo "✓ Project variants ready"
else
  echo ""
  echo "ℹ  No ./modelfiles directory found — skipping project variants."
  echo "   Copy modelfiles-template/Modelfile.template to get started."
fi

# ── Show installed models ─────────────────────────────────────────────────────
echo ""
echo "Installed models:"
ollama list

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Local AI endpoint: http://localhost:11434"
echo ""
echo "  Next steps:"
echo "  1. Copy .env.development.example → .env.development"
echo "  2. Set OLLAMA_MODEL to your variant name"
echo "  3. npm run dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
