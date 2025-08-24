# Complete AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Install system dependencies including Node.js and nginx
RUN apt-get update && apt-get install -y \
    nginx \
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

# Copy backend files and all required modules
COPY backend/ ./backend/
COPY adapters/ ./adapters/
COPY storage/ ./storage/
COPY data/ ./data/

# Install Python dependencies
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
COPY test_imports.py /app/test_imports.py
COPY start_simple.sh /app/start_simple.sh
COPY nginx.render.conf /etc/nginx/sites-available/default

# Configure nginx
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Create app user and set permissions
RUN useradd -m -u 1001 appuser && \
    mkdir -p /var/log/nginx /var/run && \
    chmod +x /app/start_simple.sh && \
    chown -R appuser:appuser /app

# Create health check endpoint
RUN echo '<html><body>OK</body></html>' > /app/frontend/dist/health

# Expose port 
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start with simple bash script (most reliable)
CMD ["/bin/bash", "/app/start_simple.sh"]
