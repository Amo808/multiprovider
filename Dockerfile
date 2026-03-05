# Modern AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Declare build-time arguments
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_DEV_MODE="1"

# Set the environment variables for the build process
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_DEV_MODE=$VITE_DEV_MODE

# Install system dependencies and Node.js 22 LTS via fnm
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 using the official binaries
ENV NODE_VERSION=22.16.0
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
    | tar -xJ -C /usr/local --strip-components=1 \
    && node --version && npm --version

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

# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Create directories
RUN mkdir -p /app/data /app/logs

# Create non-root user
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose port for Render
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start the application with infinite patience for long OpenAI responses
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "10000", "--timeout-keep-alive", "600"]
