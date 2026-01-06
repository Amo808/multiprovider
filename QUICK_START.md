# 🚀 QUICK START - AI Chat

## Простой запуск за 3 минуты

### 1. Подготовка (один раз)

```bash
# Клонировать проект
git clone <repository-url>
cd multiprovider

# Создать папку logs
mkdir logs

# Backend setup
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Frontend setup  
cd ../frontend
npm install
```

### 2. Настройка .env файлов (один раз)

**backend/.env:**

```env
DEV_MODE=1
FORCE_DEV_AUTH=1
BYPASS_GOOGLE_AUTH=1
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
DEEPSEEK_API_KEY=your_key
GEMINI_API_KEY=your_key

# Mem0 Memory (опционально)
MEM0_ENABLED=1
# Без DATABASE_URL будет использоваться in-memory storage (данные теряются при перезапуске)
# MEM0_DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres
```

**frontend/.env.local:**

```env
VITE_DEV_MODE=1
FORCE_DEV_AUTH=1
BYPASS_GOOGLE_AUTH=1
```

### 3. Запуск (каждый раз)

**Terminal 1 - Backend:**

```bash
cd backend
.venv\Scripts\Activate.ps1
python main.py --timeout 300
```

**Terminal 2 - Frontend:**

```bash
cd frontend
cmd /c "npm run dev"
```

### 4. Готово!

* Открыть: http://localhost:3000
* Автоматический вход как dev@example.com

### 5. Проверить Mem0 (опционально)

```bash
# Проверить статус Mem0
curl http://localhost:8000/api/memory/status

# Если работает, увидите:
# {"enabled": true, "backend": "in-memory", "status": "ready"}
```

## ⚡ Быстрые команды

```bash
# Если что-то не работает
taskkill /f /im python.exe
taskkill /f /im node.exe

# Полная переустановка frontend
cd frontend && rm -rf node_modules && npm install

# Проверка backend
curl http://localhost:8000/health

# Проверка Mem0
curl http://localhost:8000/api/memory/status
```

## 🔧 Частые проблемы

| Проблема | Решение |
|----------|---------|
| npm run dev не работает | `cmd /c "npm run dev"` |
| Python не найден | Полный путь к .venv\Scripts\python.exe |
| Google Auth висит | Проверить .env файлы и перезапустить |
| Зависимости отсутствуют | npm install недостающие пакеты |
| Mem0 не работает | Проверить `MEM0_ENABLED=1` и наличие `OPENAI_API_KEY` |

## 🧠 Mem0 Memory (опционально)

Mem0 добавляет долгосрочную память AI - запоминает факты о пользователе.

### Локально (in-memory, для тестов):

```env
MEM0_ENABLED=1
# Данные теряются при перезапуске!
```

### С Supabase (persistent):

```env
MEM0_ENABLED=1
MEM0_DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

### Как проверить что работает:

1. В логах backend при запуске:

```
✅ mem0 package available (Open Source version)
✅ Mem0 memory store initialized with in-memory backend
```

2. API endpoint:

```bash
curl http://localhost:8000/api/memory/status
```
