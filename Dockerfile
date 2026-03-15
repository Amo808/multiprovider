# Modern AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Declare build-time arguments
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_DEV_MODE="1"

# Set the environment variables for the build process
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_DEV_MODE=$VITE_DEV_MODE

# Install system dependencies (git required for openclaw npm install)
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 using the official binaries
ENV NODE_VERSION=22.16.0
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz \
    | tar -xz -C /usr/local --strip-components=1 \
    && node --version && npm --version

# Install OpenClaw CLI globally (avoids npx download on every restart)
RUN npm install -g openclaw@latest && openclaw --version || echo "openclaw installed"

# Install Agent Town globally (pixel-art AI agent office interface)
RUN npm install -g @geezerrrr/agent-town@latest && echo "agent-town installed"

# Set working directory
WORKDIR /app

# Copy and build frontend first
COPY frontend/package*.json ./frontend/

# Clean install with proper Rollup handling
RUN cd frontend && \
    rm -rf node_modules package-lock.json && \
    npm install --legacy-peer-deps && \
    npm install @rollup/rollup-linux-x64-gnu@4.24.0 --save-optional --no-save --silent || true

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Copy Python modules and backend files
COPY adapters/ ./adapters/
COPY storage/ ./storage/
COPY data/ ./data/
COPY backend/ ./backend/

# Copy OpenClaw production config and workspace identity files
COPY openclaw_config/ ./openclaw_config/

# Copy production startup script
COPY start_production.sh ./start_production.sh
RUN chmod +x ./start_production.sh

# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create directories
RUN mkdir -p /app/data /app/logs

# Create non-root user and set up home directory for openclaw
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app && \
    mkdir -p /home/appuser/.openclaw && \
    chown -R appuser:appuser /home/appuser/.openclaw

USER appuser

# Expose port for Render
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start with production script (sets up openclaw config, then starts uvicorn)
CMD ["./start_production.sh"]
