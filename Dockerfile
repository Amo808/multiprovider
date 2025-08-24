# Complete AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    wget \
    curl \
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

# Copy backend files and install Python dependencies
COPY backend/ ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt && \
    python3 -m pip install --no-cache-dir -r backend/requirements.txt && \
    echo "=== CHECKING PYTHON INSTALLATION ===" && \
    python3 --version && \
    pip --version && \
    pip show fastapi && \
    python3 -c "import sys; print('Python path:', sys.path)" && \
    python3 -c "import fastapi; print('FastAPI version:', fastapi.__version__)" && \
    echo "=== INSTALLATION CHECK COMPLETE ==="

# Copy configuration files and render_server
COPY render_server.py /app/render_server.py

# Configure nginx
# Not needed - render_server.py handles everything

# Create app user and set permissions
RUN useradd -m -u 1001 appuser && \
    chmod +x /app/render_server.py && \
    chown -R appuser:appuser /app

# Create health check endpoint (done by render_server.py)

# Expose port 
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start with render_server.py - the perfect solution!
CMD ["python3", "/app/render_server.py"]
