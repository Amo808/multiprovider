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
echo "🧩 UI Libraries:"
if grep -q "shadcn-ui" frontend/package.json 2>/dev/null; then
  echo "✅ shadcn/ui CLI installed"
else
  echo "❌ shadcn/ui CLI missing"
fi
if grep -q "@radix-ui/react-dropdown-menu" frontend/package.json 2>/dev/null; then
  echo "✅ Radix advanced components installed"
fi

echo ""
echo "🔧 shadcn/ui Commands:"
echo "Init (already manual): npx shadcn-ui init"
echo "Add component:       npx shadcn-ui add dropdown-menu"
echo "List components:     npx shadcn-ui list"

echo ""
echo "💡 Useful Scripts (PowerShell):"
echo "Start backend:  cd backend; python main.py --timeout 300"
echo "Start frontend: cd frontend; npm run dev"
echo "Lint frontend:  cd frontend; npm run lint"

echo ""
echo "📖 Documentation:"
echo "- README.md: Полное руководство"
echo "- QUICK_START.md: Быстрый старт"
echo "- DEPLOYMENT.md: Инструкции по развертыванию"
echo "- UI_GUIDE.md: Паттерны интерфейса (добавить при необходимости)"
