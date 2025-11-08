#!/bin/bash
# Status check script for AI Chat

echo "🚀 AI Chat Status Check"
echo "======================="

echo ""
echo "📦 Backend Status:"
curl -s http://localhost:8000/health > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Backend: Running (http://localhost:8000)"
else
    echo "❌ Backend: Not running"
fi

echo ""
echo "📦 Frontend Status:"
curl -s http://localhost:3000 > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Frontend: Running (http://localhost:3000)"
else
    echo "❌ Frontend: Not running"
fi

echo ""
echo "📋 Quick Commands:"
echo "Backend:  cd backend && python main.py --timeout 300"
echo "Frontend: cd frontend && cmd /c \"npm run dev\""
echo ""
echo "📖 Documentation:"
echo "- README.md: Полное руководство"
echo "- QUICK_START.md: Быстрый старт"
echo "- DEPLOYMENT.md: Инструкции по развертыванию"
