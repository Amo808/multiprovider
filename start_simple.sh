#!/bin/bash
set -e

echo "🚀 Starting AI Chat on Render.com"
echo "=================================="

# Start backend in background
echo "🔧 Starting backend server..."
cd /app/backend
python3 main.py &
BACKEND_PID=$!
echo "✅ Backend started with PID: $BACKEND_PID"

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Check backend health
for i in {1..10}; do
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        echo "✅ Backend is healthy!"
        break
    fi
    echo "⏳ Backend check $i/10..."
    sleep 2
    if [ $i -eq 10 ]; then
        echo "❌ Backend health check failed"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
done

# Start nginx in foreground
echo "🌐 Starting nginx server..."
echo "🎉 All services ready!"

# Handle shutdown gracefully  
trap 'echo "⏹️ Shutting down..."; kill $BACKEND_PID 2>/dev/null || true; nginx -s quit 2>/dev/null || true; exit 0' SIGTERM SIGINT

# Start nginx in foreground (keeps container running)
exec nginx -g "daemon off;"
