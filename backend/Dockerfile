# Backend Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Expose port
EXPOSE 8000

# Health check with extended timeout for GPT-5 compatibility
HEALTHCHECK --interval=30s --timeout=60s --start-period=10s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:$PORT/health', timeout=30)" || exit 1

# Render uses PORT environment variable
EXPOSE $PORT

# Start command with production settings for large input handling
CMD ["sh", "-c", "python main.py --host 0.0.0.0 --port ${PORT:-8000} --timeout 300"]
