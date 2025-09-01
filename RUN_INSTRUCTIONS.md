# Инструкции по запуску AI Chat

## Структура проекта
```
ai-chat/
├── backend/           # Python FastAPI backend
├── frontend/          # React + TypeScript frontend
├── adapters/          # AI provider adapters (OpenAI, DeepSeek, etc.)
├── data/             # Конфигурационные файлы
└── logs/             # Логи приложения
```

## Предварительные требования
- Python 3.8+
- Node.js 16+
- npm или pnpm

## Запуск Backend

### PowerShell команда (рекомендуемый способ):
```powershell
cd "c:\Users\Amo\Desktop\mulit\backend"; python main.py
```

### Пошаговый запуск:
1. **Переход в директорию backend**
   ```powershell
   cd "c:\Users\Amo\Desktop\mulit\backend"
   ```

2. **Активация виртуального окружения (если нужно)**
   ```powershell
   # Если окружение уже создано:
   .venv\Scripts\activate

   # Если окружение не создано:
   python -m venv .venv
   .venv\Scripts\activate
   ```

3. **Установка зависимостей (если нужно)**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Запуск сервера**
   ```powershell
   python main.py
   ```
Сервер запустится на `http://localhost:8000`

## Запуск Frontend

### PowerShell команда (рекомендуемый способ):
```powershell
cd "c:\Users\Amo\Desktop\mulit\frontend"; npm run dev
```

### Пошаговый запуск:
1. **Переход в директорию frontend**
   ```powershell
   cd "c:\Users\Amo\Desktop\mulit\frontend"
   ```

2. **Установка зависимостей (если нужно)**
   ```powershell
   npm install
   ```

3. **Запуск dev сервера**
   ```powershell
   npm run dev
   ```
Frontend запустится на `http://localhost:5173`

## Полный запуск (оба сервиса)

### Вариант 1: PowerShell команды (рекомендуемый)
**Backend (терминал 1):**
```powershell
cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\backend"; python main.py
```

**Frontend (терминал 2):**
```powershell
cd "c:\Users\Amo\Desktop\mulit\frontend"; npm run dev
```

### Вариант 2: Пошагово в двух терминалах
1. **Терминал 1 (Backend):**
   ```powershell
   cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\backend"
   .venv\Scripts\activate
   python main.py
   ```

2. **Терминал 2 (Frontend):**
   ```powershell
   cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\frontend"
   npm run dev
   ```

### Вариант 3: Использование start.bat (если создан)
```powershell
cd "c:\Users\Amo\Desktop\lobecopy\ai-chat"
start.bat
```

## Быстрый запуск (одна команда)

Если у вас уже всё настроено, можете запустить оба сервера одной командой PowerShell с разделением процессов:

```powershell
# Запустить Backend в фоне и сразу Frontend
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\backend"; python main.py'; cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\frontend"; npm run dev
```

Или откройте два окна PowerShell и выполните команды параллельно:
1. **Окно 1**: `cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\backend"; python main.py`
2. **Окно 2**: `cd "c:\Users\Amo\Desktop\lobecopy\ai-chat\frontend"; npm run dev`

## Доступ к приложению

- **Frontend**: http://localhost:5173 (или другой порт, если 5173 занят - Vite автоматически найдет свободный)
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

> **Примечание**: Если порт 5173 занят, Vite автоматически выберет следующий доступный порт (3000, 3001, 3002, и т.д.). Проверьте вывод команды `npm run dev` для точного адреса.

## Настройка провайдеров

1. Откройте приложение в браузере
2. Нажмите кнопку "Provider Settings" 
3. Настройте API ключи для нужных провайдеров:
   - OpenAI: Нужен API ключ от OpenAI
   - DeepSeek: Нужен API ключ от DeepSeek
   - Anthropic: Нужен API ключ от Anthropic

## Решение проблем

### Backend не запускается
- Проверьте, что виртуальное окружение активировано
- Убедитесь, что все зависимости установлены
- Проверьте, что порт 8000 свободен

### Frontend не запускается
- Убедитесь, что Node.js установлен
- Проверьте, что зависимости установлены (`npm install`)
- Проверьте, что порт 5173 свободен

### Провайдер показывает "Connected" но не работает
- Проверьте правильность API ключа
- Нажмите "Test Connection" для проверки
- Обновите модели кнопкой "Refresh Models"

## Последние изменения (20.08.2025)

### Исправлены проблемы с OpenAI провайдером:
- ✅ Исправлена валидация OpenAI провайдера - больше не показывает "Connected" при неправильном API ключе
- ✅ Добавлены эндпоинты для тестирования и обновления моделей:
  - `POST /providers/{provider_id}/test` - тест соединения
  - `POST /providers/{provider_id}/models/refresh` - обновление списка моделей
- ✅ Улучшена обработка ошибок в UI - теперь показываются уведомления вместо alert()
- ✅ Добавлена правильная индикация статуса API ключей (красный/зеленый индикатор)
- ✅ Кнопки "Refresh Models" и "Test Connection" теперь показывают результат и состояние загрузки

### Исправлена валидация подключений:
- OpenAI провайдер теперь правильно обрабатывает ошибки 401/403
- Улучшена проверка placeholder API ключей (your_api_key_here, sk-test-, etc.)
- Добавлена проверка наличия API ключа перед попытками подключения

### Обновлены PowerShell команды:
- Добавлены правильные команды для Windows PowerShell с кавычками в путях
- Команды протестированы и работают корректно

## Тестирование исправлений OpenAI

1. **Запустите приложение** (используя команды выше)
2. **Откройте Provider Settings** в веб-интерфейсе
3. **Для OpenAI провайдера**:
   - Убедитесь, что показывается красный индикатор API key (если ключ не настроен)
   - Попробуйте нажать "Test Connection" - должно показать ошибку о неправильном ключе
   - Нажмите "Refresh Models" - должно показать ошибку
   - Добавьте правильный API ключ через кнопку "API Key"
   - После добавления ключа статус должен поменяться на зеленый
   - "Test Connection" должен показать успех
   - "Refresh Models" должен загрузить список моделей

## Быстрая диагностика проблем

```powershell
# Проверить статус backend
Invoke-WebRequest -Uri "http://localhost:8000/health" -Method GET

# Проверить провайдеры
Invoke-WebRequest -Uri "http://localhost:8000/providers" -Method GET

# Проверить доступность frontend
Invoke-WebRequest -Uri "http://localhost:3002" -Method GET
```
