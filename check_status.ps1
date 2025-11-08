# AI Chat Status Check (PowerShell)

Write-Host "🚀 AI Chat Status Check" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan

Write-Host ""
Write-Host "📦 Backend Status:" -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 5 | Out-Null
    Write-Host "✅ Backend: Running (http://localhost:8000)" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend: Not running" -ForegroundColor Red
}

Write-Host ""
Write-Host "📦 Frontend Status:" -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -TimeoutSec 5 | Out-Null
    Write-Host "✅ Frontend: Running (http://localhost:3000)" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend: Not running" -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 Quick Commands:" -ForegroundColor Magenta
Write-Host "Backend:  cd backend && .venv\Scripts\Activate.ps1 && python main.py --timeout 300"
Write-Host "Frontend: cd frontend && cmd /c `"npm run dev`""

Write-Host ""
Write-Host "📖 Documentation:" -ForegroundColor Blue
Write-Host "- README.md: Полное руководство"
Write-Host "- QUICK_START.md: Быстрый старт за 3 минуты"
Write-Host "- DEPLOYMENT.md: Инструкции по развертыванию"
