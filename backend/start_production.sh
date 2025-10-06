#!/bin/bash

# Production deployment script with GPT-5 optimizations
echo "🚀 Deploying Multi-Provider Chat with GPT-5 support..."

# Backend with production optimizations
echo "📦 Building backend with extended timeouts..."
gunicorn main:app \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 2 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 300 \
    --keep-alive 120 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --preload \
    --log-level info \
    --access-logfile - \
    --error-logfile - \
    --capture-output \
    --enable-stdio-inheritance
