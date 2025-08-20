# Docker Hub Deployment Guide

Это руководство объясняет, как подготовить, собрать и развернуть AI Chat на Docker Hub для последующего использования на Render и других платформах.

## Подготовка к публикации на Docker Hub

### 1. Создание аккаунта Docker Hub

1. Зарегистрируйтесь на [Docker Hub](https://hub.docker.com)
2. Создайте репозиторий для ваших образов
3. Войдите в Docker через командную строку:
   ```bash
   docker login
   ```

### 2. Структура образов

Мы создаем три типа образов:
- `ai-chat-backend` - только backend сервис
- `ai-chat-frontend` - только frontend сервис  
- `ai-chat` - полное приложение (backend + frontend + nginx)

## Сборка и публикация образов

### Автоматическая сборка (рекомендуется)

Используйте готовые скрипты:

**Linux/macOS:**
```bash
chmod +x docker-build.sh
./docker-build.sh v1.0.0 your-dockerhub-username
```

**Windows:**
```cmd
docker-build.bat v1.0.0 your-dockerhub-username
```

### Ручная сборка

```bash
# Backend
docker build -f backend/Dockerfile.production -t your-username/ai-chat-backend:v1.0.0 ./backend/
docker push your-username/ai-chat-backend:v1.0.0

# Frontend
docker build -f frontend/Dockerfile.production -t your-username/ai-chat-frontend:v1.0.0 ./frontend/
docker push your-username/ai-chat-frontend:v1.0.0

# Complete app
docker build -t your-username/ai-chat:v1.0.0 .
docker push your-username/ai-chat:v1.0.0
```

## Использование опубликованных образов

### Запуск через Docker Compose

1. Создайте `.env` файл:
   ```env
   DOCKER_USERNAME=your-dockerhub-username
   VERSION=v1.0.0
   OPENAI_API_KEY=your-openai-key
   ANTHROPIC_API_KEY=your-anthropic-key
   DEEPSEEK_API_KEY=your-deepseek-key
   ```

2. Запустите приложение:
   ```bash
   docker-compose -f docker-compose.hub.yml up -d
   ```

### Запуск отдельных сервисов

**Backend:**
```bash
docker run -d \
  -p 8000:8000 \
  -e OPENAI_API_KEY=your-key \
  -v $(pwd)/data:/app/data \
  your-username/ai-chat-backend:v1.0.0
```

**Frontend:**
```bash
docker run -d \
  -p 80:80 \
  your-username/ai-chat-frontend:v1.0.0
```

**Полное приложение:**
```bash
docker run -d \
  -p 80:80 \
  -p 8000:8000 \
  -e OPENAI_API_KEY=your-key \
  -v $(pwd)/data:/app/data \
  your-username/ai-chat:v1.0.0
```

## Развертывание на Render

### Вариант 1: Использование готовых образов

1. В Render создайте новый Web Service
2. Выберите "Deploy an existing image from a registry"
3. Укажите ваш образ: `your-username/ai-chat:latest`
4. Настройте переменные окружения
5. Установите порт: `80`

### Вариант 2: Использование render-dockerhub.yaml

1. Скопируйте `render-dockerhub.yaml` в корень вашего репозитория
2. Отредактируйте имена образов на ваши
3. Подключите репозиторий к Render
4. Render автоматически развернет сервисы

## Переменные окружения для production

```env
# Backend
PORT=8000
PYTHONUNBUFFERED=1

# API Keys
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
GOOGLE_API_KEY=your-google-api-key
COHERE_API_KEY=your-cohere-api-key

# Optional: Custom model configurations
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

## Мониторинг и логи

### Проверка состояния контейнеров
```bash
docker ps
docker logs <container-id>
```

### Health checks
Все образы включают health checks:
- Backend: `http://localhost:8000/health`
- Frontend: `http://localhost:80/health`

### Метрики производительности
```bash
docker stats
```

## Обновление образов

### Создание новой версии
```bash
./docker-build.sh v1.1.0 your-username
```

### Обновление на Render
1. Обновите версию в переменных окружения Render
2. Или используйте тег `latest` для автоматических обновлений

## Безопасность

### Рекомендации:
1. Не включайте API ключи в образы
2. Используйте переменные окружения
3. Регулярно обновляйте базовые образы
4. Сканируйте образы на уязвимости:
   ```bash
   docker scan your-username/ai-chat:latest
   ```

## Размеры образов

Оптимизированные размеры:
- Backend: ~200MB (Python + зависимости)
- Frontend: ~25MB (Nginx + статические файлы)
- Complete: ~250MB (объединенный образ)

## Troubleshooting

### Проблемы со сборкой
```bash
# Очистка кэша Docker
docker system prune -a

# Пересборка без кэша
docker build --no-cache -t your-image .
```

### Проблемы с доступом к Docker Hub
```bash
# Проверка аутентификации
docker info

# Повторная аутентификация
docker logout
docker login
```

### Проблемы с портами на Render
- Убедитесь, что backend слушает порт из переменной `PORT`
- Frontend должен быть на порту 80
- Проверьте настройки nginx для проксирования API запросов

## Заключение

После публикации образов на Docker Hub:
1. ✅ Ваше приложение готово к развертыванию на любой платформе
2. ✅ Render может использовать готовые образы для быстрого деплоя
3. ✅ Другие разработчики могут легко запустить ваше приложение
4. ✅ Обновления деплоятся быстрее (нет необходимости в повторной сборке)

Готовые образы на Docker Hub позволяют развертывать приложение за секунды на любой платформе, поддерживающей контейнеры!
