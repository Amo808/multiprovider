#!/bin/bash

# Production deployment script with GPT-5 optimizations
echo "🚀 Deploying Multi-Provider Chat with GPT-5 support..."

# Backend with production optimizations and infinite patience for long OpenAI requests
echo "📦 Building backend with infinite timeout for OpenAI reasoning..."
gunicorn main:app \
    --bind 0.0.0.0:${PORT:-8000} \
    --workers 2 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 0 \
    --keep-alive 600 \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --preload \
    --log-level info \
    --access-logfile - \
    --error-logfile - \
    --capture-output \
    --enable-stdio-inheritance
