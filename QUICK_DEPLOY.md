# 🚀 Готовые образы AI Chat на Docker Hub

## Быстрый деплой на Render

### Вариант 1: Использование готового образа (рекомендуется)

1. **Зайдите на [Render.com](https://render.com)**
2. **Создайте новый Web Service**
3. **Выберите "Deploy an existing image from a registry"**
4. **Укажите образ: `amochat/ai-chat:latest`**
5. **Настройте:**
   - **Port:** `80`
   - **Environment Variables:**
     ```
     OPENAI_API_KEY=ваш_ключ_openai
     ANTHROPIC_API_KEY=ваш_ключ_anthropic
     DEEPSEEK_API_KEY=ваш_ключ_deepseek
     PORT=80
     ```
6. **Нажмите Deploy**

### Вариант 2: Через GitHub (автоматический деплой)

1. **Загрузите проект на GitHub**
2. **В Render подключите ваш GitHub репозиторий**
3. **Render найдет Dockerfile и автоматически соберет**

## Готовые образы на Docker Hub

Образы уже загружены и готовы к использованию:

- **`amochat/ai-chat:latest`** - полное приложение (backend + frontend)
- **`amochat/backend:latest`** - только backend API
- **`amochat/frontend:latest`** - только frontend

## Быстрый запуск локально

Если у вас работает Docker:

```bash
# Полное приложение
docker run -p 80:80 -e OPENAI_API_KEY=ваш_ключ amochat/ai-chat:latest

# Только backend
docker run -p 8000:8000 -e OPENAI_API_KEY=ваш_ключ amochat/backend:latest

# Только frontend  
docker run -p 80:80 amochat/frontend:latest
```

## Переменные окружения для Render

```env
# Обязательные
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
DEEPSEEK_API_KEY=your-deepseek-key
PORT=80

# Опциональные
GOOGLE_API_KEY=your-google-key
COHERE_API_KEY=your-cohere-key
PYTHONUNBUFFERED=1
```

## Проверка работы

После деплоя на Render:
- Основной сайт: `https://your-app.onrender.com`
- API документация: `https://your-app.onrender.com/docs`
- Health check: `https://your-app.onrender.com/health`

## Если нужно собрать свой образ

Когда Docker заработает:

```bash
# Соберите образ
docker build -t your-username/ai-chat:latest .

# Опубликуйте на Docker Hub
docker login
docker push your-username/ai-chat:latest
```

## Альтернативы Docker Hub

### Railway
1. Подключите GitHub репозиторий
2. Railway автоматически найдет Dockerfile
3. Добавьте переменные окружения

### Vercel (только frontend)
1. Подключите репозиторий
2. Укажите папку `frontend`
3. Настройте build команды

### Heroku
1. Подключите репозиторий  
2. Добавьте heroku.yml файл
3. Настройте переменные окружения

Самый простой способ - использовать готовый образ `amochat/ai-chat:latest` на Render!
