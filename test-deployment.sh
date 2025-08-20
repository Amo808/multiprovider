#!/bin/bash

echo "=== Testing Backend Health ==="
curl -f http://localhost:8000/health || echo "Backend health check failed"

echo -e "\n=== Testing Frontend ==="
curl -f http://localhost:80/ || echo "Frontend check failed"

echo -e "\n=== Testing API Endpoint ==="
curl -f http://localhost:80/api/providers || echo "API check failed"

echo -e "\n=== Checking Processes ==="
ps aux | grep -E "(nginx|python|uvicorn)" | grep -v grep

echo -e "\n=== Checking Logs ==="
echo "Backend logs:"
tail -n 10 /var/log/supervisor/backend_*.log 2>/dev/null || echo "No backend logs found"

echo "Nginx logs:"
tail -n 10 /var/log/nginx/*.log 2>/dev/null || echo "No nginx logs found"
