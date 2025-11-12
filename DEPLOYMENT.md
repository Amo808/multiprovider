# 🚀 Deployment Guide

## 📋 Быстрые команды для запуска

### Windows PowerShell

```bash
# 1. Backend (из папки backend)
cd backend
.venv\Scripts\Activate.ps1
python main.py --timeout 300

# 2. Frontend (из папки frontend) 
cd frontend
cmd /c "npm run dev"
```

### Ожидаемые URL
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## � Системные требования

- **Node.js**: v18.20.8+ (для Vite 5.4.0)
- **Python**: 3.8+
- **npm**: 10.8.2+

## �🛠️ Если что-то не работает

### Frontend не запускается через npm run dev

**Проблема**: PowerShell не видит npm скрипт

**Решение**: Используйте cmd
```bash
cmd /c "cd /d C:\Users\Amo\Desktop\multech\multiprovider\frontend && npm run dev"
```

### Python не найден

**Проблема**: Virtual environment не активирован

**Решение**: Используйте полный путь
```bash
C:\Users\Amo\Desktop\multech\multiprovider\backend\.venv\Scripts\python.exe main.py --timeout 300
```

### Отсутствуют зависимости

```bash
# Frontend
cd frontend
npm install --legacy-peer-deps

# Backend  
cd backend
pip install -r requirements.txt
```

### Docker build не работает

**Проблема**: `npm ci` не может установить зависимости

**Решение**: Используется `npm install --legacy-peer-deps` в Dockerfile

### Версии React типов конфликтуют

**Проблема**: @types/react и @types/react-dom несовместимы

**Решение**: Зафиксированы совместимые версии в package.json:
- @types/react: ^18.2.55
- @types/react-dom: ^18.2.22
- vite: ^5.4.0

### Google Auth все еще активен

1. Проверьте `.env` файлы
2. Перезапустите оба сервера
3. Убедитесь что `DEV_MODE=1` и `FORCE_DEV_AUTH=1`

## 🐳 Production с Docker

```bash
docker-compose up --build
```

## 📦 Полная переустановка (если все сломалось)

```bash
# 1. Остановить все процессы
taskkill /f /im python.exe
taskkill /f /im node.exe

# 2. Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install

# 3. Backend
cd backend
rm -rf .venv
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. Запустить заново
# Backend: python main.py --timeout 300
# Frontend: cmd /c "npm run dev"
```
