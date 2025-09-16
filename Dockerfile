# Modern AI Chat Application Dockerfile for Render
FROM python:3.11-slim

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
RUN cd frontend && npm ci

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

# Start the application
CMD ["python", "backend/main.py"]
