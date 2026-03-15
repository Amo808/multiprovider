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

echo "[Startup] OpenClaw setup complete."

# --- 7. Start OpenClaw Gateway FIRST (it only binds 127.0.0.1, invisible to Render) ---
GW_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
echo "[Startup] Starting OpenClaw Gateway on port $GW_PORT..."
if command -v openclaw &> /dev/null; then
    openclaw gateway run --port "$GW_PORT" --verbose > /tmp/openclaw_gateway.log 2>&1 &
    GW_PID=$!
    echo "[Startup] OpenClaw Gateway started (PID $GW_PID)"

    # Wait up to 60s for gateway to become healthy
    echo "[Startup] Waiting for gateway health on port $GW_PORT..."
    GW_READY=false
    for i in $(seq 1 60); do
        if curl -sf "http://127.0.0.1:$GW_PORT/health" > /dev/null 2>&1; then
            GW_READY=true
            echo "[Startup] [OK] Gateway healthy after ${i}s"
            break
        fi
        # Check if process died
        if ! kill -0 "$GW_PID" 2>/dev/null; then
            echo "[Startup] [WARN] Gateway process died (exit code: $(wait $GW_PID 2>/dev/null; echo $?))"
            echo "[Startup] Gateway logs (last 30 lines):"
            tail -30 /tmp/openclaw_gateway.log 2>/dev/null || true
            # Try restarting once
            echo "[Startup] Retrying gateway start..."
            openclaw gateway run --port "$GW_PORT" > /tmp/openclaw_gateway.log 2>&1 &
            GW_PID=$!
            echo "[Startup] Gateway restarted (PID $GW_PID)"
        fi
        sleep 1
    done
    if [ "$GW_READY" = false ]; then
        echo "[Startup] [WARN] Gateway not healthy after 60s — continuing anyway"
        echo "[Startup] Gateway logs (last 20 lines):"
        tail -20 /tmp/openclaw_gateway.log 2>/dev/null || true
    fi
else
    echo "[Startup] [WARN] openclaw CLI not found, gateway will not be started"
fi

# --- 8. Start uvicorn (Render detects port 10000 as primary) ---
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

# --- 9. Start Agent Town in background on port 3001 ---
# Agent Town always binds 0.0.0.0 but Render already locked onto port 10000.
if command -v agent-town &> /dev/null; then
    echo "[Startup] Starting Agent Town on port 3001..."
    GATEWAY_URL="ws://127.0.0.1:$GW_PORT/" \
    NEXT_PUBLIC_GATEWAY_TOKEN="$GW_TOKEN" \
    NEXT_PUBLIC_GATEWAY_URL="ws://127.0.0.1:$GW_PORT/" \
    CSP_CONNECT_SRC="wss://multeck.onrender.com ws://multeck.onrender.com" \
    PORT=3001 \
        agent-town --port 3001 --gateway "ws://127.0.0.1:$GW_PORT/" &
    AGENT_TOWN_PID=$!
    echo "[Startup] Agent Town started (PID $AGENT_TOWN_PID)"
else
    echo "[Startup] Agent Town not installed, skipping"
fi

# --- 10. Wait for main process (uvicorn) ---
wait $UVICORN_PID
