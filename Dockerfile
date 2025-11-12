# Modern AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Declare build-time arguments
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_DEV_MODE="1"

# Set the environment variables for the build process
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_DEV_MODE=$VITE_DEV_MODE

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy and build frontend first
COPY frontend/package*.json ./frontend/
RUN cd frontend && rm -rf node_modules package-lock.json
RUN cd frontend && npm install --legacy-peer-deps --no-optional

COPY frontend/ ./frontend/
RUN cd frontend && rm -rf node_modules/.cache
RUN cd frontend && npm rebuild --verbose
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
