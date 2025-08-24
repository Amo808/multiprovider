#!/bin/bash
set -e

echo "🚀 Starting AI Chat on Render.com"
echo "=========================================="

# Function to check if backend is ready
check_backend() {
    curl -f http://localhost:8000/health >/dev/null 2>&1
}

# Find working Python
echo "🔍 Finding Python executable..."
PYTHON=""
for py in python3 /usr/bin/python3 /usr/local/bin/python3 python; do
    if command -v "$py" >/dev/null 2>&1; then
        echo "✅ Found Python: $py ($($py --version))"
        PYTHON="$py"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "❌ No Python found!"
    exit 1
fi

# Start backend
echo "🔧 Starting backend with $PYTHON..."
cd /app/backend
$PYTHON main.py &
BACKEND_PID=$!
echo "✅ Backend started with PID: $BACKEND_PID"

# Wait for backend to be ready
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Check backend health
for i in {1..10}; do
    if check_backend; then
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

# Start nginx
echo "🌐 Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!
echo "✅ Nginx started with PID: $NGINX_PID"

echo "🎉 All services started successfully!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:10000"
echo "   Health:   http://localhost:10000/health"

# Handle shutdown
cleanup() {
    echo "⏹️ Shutting down services..."
    kill $NGINX_PID 2>/dev/null || true
    kill $BACKEND_PID 2>/dev/null || true
    wait
    exit 0
}

trap cleanup SIGTERM SIGINT

# Keep script running and monitor processes
while true; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo "❌ Backend process died, restarting..."
        cd /app/backend
        $PYTHON main.py &
        BACKEND_PID=$!
        sleep 5
    fi
    
    if ! kill -0 $NGINX_PID 2>/dev/null; then
        echo "❌ Nginx process died, restarting..."
        nginx -g "daemon off;" &
        NGINX_PID=$!
        sleep 2
    fi
    
    sleep 10
done
