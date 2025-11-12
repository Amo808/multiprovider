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

**Проблема**: `npm ci` не может установить зависимости или Rollup ошибка

**Решения**:
1. **Rollup/Vite ошибка**: Зафиксированы совместимые версии в package.json:
   - vite: 5.4.0 (совместимо с Node.js 18.20.8)
   - rollup: 4.24.0
   - @rollup/rollup-linux-x64-gnu: 4.24.0 (опциональная зависимость для Docker)

2. **npm ci ошибка**: Используется `npm install --legacy-peer-deps` в Dockerfile

3. **Если все еще не работает**:
```bash
# Очистка и пересборка
docker system prune -f
docker-compose build --no-cache
```

### Версии React типов конфликтуют

**Проблема**: @types/react версии 18.x vs 19.x конфликт

**Решение**: Зафиксированы совместимые версии:
```bash
cd frontend
npm install @types/react@18.2.55 @types/react-dom@18.3.7 --save-dev --save-exact
```

**Проблема**: @types/react и @types/react-dom несовместимы

**Решение**: Зафиксированы совместимые версии в package.json:
- @types/react: ^18.2.55
- @types/react-dom: ^18.3.7 (вместо ^19.2.2)
- vite: 5.4.0 (стабильная версия)
- rollup: 4.24.0 (совместимая с vite 5.4.0)

**Если проблема повторяется**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

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
