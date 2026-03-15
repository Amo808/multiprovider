#!/bin/bash
# Production startup script for Multech with OpenClaw Gateway
# Sets up openclaw config, starts gateway, then starts backend

set -e

OPENCLAW_HOME="$HOME/.openclaw"
OPENCLAW_CONFIG="/app/openclaw_config"

echo "[Startup] Setting up OpenClaw for production..."

# --- 1. Create directory structure ---
mkdir -p "$OPENCLAW_HOME/workspace/memory"
mkdir -p "$OPENCLAW_HOME/agents/main/agent"
mkdir -p "$OPENCLAW_HOME/agents/main/sessions"
mkdir -p "$OPENCLAW_HOME/skills"
mkdir -p "$OPENCLAW_HOME/logs"
mkdir -p "$OPENCLAW_HOME/devices"
mkdir -p "$OPENCLAW_HOME/identity"

# --- 2. Generate openclaw.json with production token ---
# Use OPENCLAW_GATEWAY_TOKEN env var or default
GW_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-multech-production-gw-token-2026}"

cat > "$OPENCLAW_HOME/openclaw.json" << ENDCONFIG
{
  "meta": {
    "lastTouchedVersion": "2026.3.8",
    "lastTouchedAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  },
  "env": {
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY:-}",
    "OPENAI_API_KEY": "${OPENAI_API_KEY:-}",
    "GEMINI_API_KEY": "${GEMINI_API_KEY:-}",
    "DEEPSEEK_API_KEY": "${DEEPSEEK_API_KEY:-}",
    "GOOGLE_API_KEY": "${GOOGLE_API_KEY:-}"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-20250514",
        "fallbacks": []
      },
      "models": {},
      "workspace": "$OPENCLAW_HOME/workspace",
      "maxConcurrent": 3
    },
    "list": [
      {
        "id": "main",
        "default": true,
        "identity": {
          "name": "Multech",
          "theme": "AI assistant for Multech platform",
          "emoji": "🧠"
        }
      }
    ]
  },
  "tools": {
    "sessions": {
      "visibility": "all"
    }
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "botToken": "${TELEGRAM_BOT_TOKEN:-}",
      "groups": {
        "*": {
          "requireMention": true
        }
      },
      "groupPolicy": "open",
      "streaming": "partial"
    }
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "$GW_TOKEN"
    }
  },
  "skills": {
    "entries": {}
  }
}
ENDCONFIG

echo "[Startup] Generated openclaw.json (token: ${GW_TOKEN:0:10}...)"

# --- 3. Copy workspace identity files ---
if [ -d "$OPENCLAW_CONFIG/workspace" ]; then
    cp -r "$OPENCLAW_CONFIG/workspace/"* "$OPENCLAW_HOME/workspace/" 2>/dev/null || true
    echo "[Startup] Copied workspace identity files"
fi

# --- 4. Create .env with API keys for gateway ---
{
    [ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
    [ -n "$OPENAI_API_KEY" ] && echo "OPENAI_API_KEY=$OPENAI_API_KEY"
    [ -n "$DEEPSEEK_API_KEY" ] && echo "DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY"
    [ -n "$GOOGLE_API_KEY" ] && echo "GOOGLE_API_KEY=$GOOGLE_API_KEY"
    [ -n "$GEMINI_API_KEY" ] && echo "GEMINI_API_KEY=$GEMINI_API_KEY"
    [ -n "$TELEGRAM_BOT_TOKEN" ] && echo "TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN"
} > "$OPENCLAW_HOME/.env"

echo "[Startup] Created .env with available API keys"

# --- 4b. Debug: Show which API keys are set (masked) ---
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "[Startup] ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:12}...${ANTHROPIC_API_KEY: -4} (length=${#ANTHROPIC_API_KEY})"
else
    echo "[Startup] WARNING: ANTHROPIC_API_KEY is NOT set! OpenClaw agent will fail."
fi
[ -n "$OPENAI_API_KEY" ] && echo "[Startup] OPENAI_API_KEY: set (length=${#OPENAI_API_KEY})"
[ -n "$GEMINI_API_KEY" ] && echo "[Startup] GEMINI_API_KEY: set (length=${#GEMINI_API_KEY})"
[ -n "$TELEGRAM_BOT_TOKEN" ] && echo "[Startup] TELEGRAM_BOT_TOKEN: set (length=${#TELEGRAM_BOT_TOKEN})"

# --- 5. Set OPENCLAW_STATE_DIR so client finds the config ---
export OPENCLAW_STATE_DIR="$OPENCLAW_HOME"
export OPENCLAW_GATEWAY_TOKEN="$GW_TOKEN"

# --- 6. Verify openclaw is installed ---
if command -v openclaw &> /dev/null; then
    echo "[Startup] OpenClaw CLI: $(openclaw --version 2>/dev/null || echo 'installed')"
elif command -v npx &> /dev/null; then
    echo "[Startup] npx available, will use npx openclaw@latest"
else
    echo "[Startup] WARNING: openclaw CLI not found and no npx"
fi

echo "[Startup] OpenClaw setup complete. Starting backend & Agent Town..."

# --- 7. Start uvicorn FIRST so Render detects port 10000 as primary ---
# CRITICAL: Render auto-detects the FIRST port that binds to 0.0.0.0.
# Uvicorn must bind port 10000 before Agent Town binds port 3001.
echo "[Startup] Starting uvicorn on port ${PORT:-10000}..."
uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-10000}" \
    --timeout-keep-alive 600 &
UVICORN_PID=$!
echo "[Startup] Uvicorn started (PID $UVICORN_PID)"

# Wait for uvicorn to bind the port before starting Agent Town
sleep 3

# --- 8. Start Agent Town in background on port 3001 ---
# Agent Town always binds 0.0.0.0 but Render already locked onto port 10000.
# NEXT_PUBLIC_GATEWAY_TOKEN lets Agent Town auto-connect to the gateway.
if command -v agent-town &> /dev/null; then
    echo "[Startup] Starting Agent Town on port 3001..."
    GATEWAY_URL="ws://127.0.0.1:18789/" \
    NEXT_PUBLIC_GATEWAY_TOKEN="$GW_TOKEN" \
    NEXT_PUBLIC_GATEWAY_URL="ws://127.0.0.1:18789/" \
    PORT=3001 \
        agent-town --port 3001 --gateway "ws://127.0.0.1:18789/" &
    AGENT_TOWN_PID=$!
    echo "[Startup] Agent Town started (PID $AGENT_TOWN_PID)"
else
    echo "[Startup] Agent Town not installed, skipping"
fi

# --- 9. Wait for main process (uvicorn) ---
wait $UVICORN_PID
