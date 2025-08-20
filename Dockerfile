# Multi-stage Dockerfile for complete AI Chat application
FROM python:3.11-slim as backend

# Backend stage
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8000

WORKDIR /app/backend

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ .
RUN mkdir -p /app/backend/data /app/backend/logs /app/backend/storage

# Create non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# Frontend build stage
FROM node:18-alpine as frontend-builder

WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copy frontend source and build
COPY frontend/ .
RUN npm run build

# Final stage - combine both
FROM nginx:alpine

# Install supervisor to manage multiple processes
RUN apk add --no-cache supervisor python3 py3-pip curl

# Copy supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy backend from first stage
COPY --from=backend /app/backend /app/backend
COPY --from=backend /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend /usr/local/bin /usr/local/bin

# Copy frontend from builder stage
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx config
COPY frontend/nginx.production.conf /etc/nginx/conf.d/default.conf

# Copy data and config files
COPY data/ /app/data/

# Set permissions
RUN adduser -D -s /bin/sh appuser && \
    chown -R appuser:appuser /app && \
    mkdir -p /var/log/supervisor

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:80/health && curl -f http://localhost:8000/health || exit 1

# Expose ports
EXPOSE 80 8000

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
