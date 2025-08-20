# Complete AI Chat Application Dockerfile for Render
FROM python:3.11-slim

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    wget \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && update-alternatives --install /usr/bin/python python /usr/bin/python3 1

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

# Copy configuration files
COPY nginx.render.conf /etc/nginx/sites-available/default
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Configure nginx
RUN rm -f /etc/nginx/sites-enabled/default && \
    ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Create app user and set permissions
RUN useradd -m -u 1001 appuser && \
    mkdir -p /var/log/supervisor /var/run && \
    echo "Python paths:" && \
    which python3 || echo "python3 not found" && \
    which python || echo "python not found" && \
    ls -la /usr/bin/python* && \
    chown -R appuser:appuser /app

# Create health check endpoint
RUN echo '<html><body>OK</body></html>' > /app/frontend/dist/health

# Expose port 
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start supervisord
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
