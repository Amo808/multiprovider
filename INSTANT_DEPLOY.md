# 🚀 Мгновенный деплой AI Chat

## Render.com (1 клик деплой)

### Готовый образ Docker:
1. **[Создать Web Service на Render →](https://dashboard.render.com/web/new)**
2. **Выберите**: "Deploy an existing image from a registry"
3. **Image URL**: `amochat/ai-chat:latest` 
4. **Port**: `80`
5. **Environment Variables** (добавьте ваши API ключи):
   ```
   OPENAI_API_KEY=sk-ваш-ключ-openai
   ANTHROPIC_API_KEY=ваш-ключ-anthropic  
   DEEPSEEK_API_KEY=ваш-ключ-deepseek
   PORT=80
   ```
6. **Deploy** → Готово! 🎉

### Результат:
- ✅ Приложение будет доступно по адресу: `https://your-app-name.onrender.com`
- ✅ API документация: `https://your-app-name.onrender.com/docs`
- ✅ Автоматические обновления при изменении образа

## Railway.app

1. **[Зайти на Railway →](https://railway.app)**
2. **New Project** → **Deploy from Docker Image**
3. **Image**: `amochat/ai-chat:latest`
4. **Port**: `80`
5. **Variables**: добавьте API ключи
6. **Deploy**

## Heroku (через Container Registry)

```bash
# Если у вас работает Docker
heroku login
heroku container:login

# Создать приложение
heroku create your-app-name

# Развернуть готовый образ
heroku container:push web --arg image=amochat/ai-chat:latest
heroku container:release web

# Добавить переменные
heroku config:set OPENAI_API_KEY=your-key
```

## DigitalOcean App Platform

1. **[Создать приложение →](https://cloud.digitalocean.com/apps/new)**
2. **Container Image**: `amochat/ai-chat:latest`
3. **HTTP Port**: `80`  
4. **Environment Variables**: добавить API ключи
5. **Create Resources**

## Fly.io

```bash
# Если у вас работает Docker
fly launch --image amochat/ai-chat:latest
fly secrets set OPENAI_API_KEY=your-key
fly deploy
```

## Google Cloud Run

```bash
gcloud run deploy ai-chat \
  --image=amochat/ai-chat:latest \
  --port=80 \
  --set-env-vars="OPENAI_API_KEY=your-key"
```

## AWS ECS/Fargate

1. Создать Task Definition с образом `amochat/ai-chat:latest`
2. Port mapping: `80:80`
3. Environment Variables: API ключи
4. Создать Service

---

## 🔥 Самый быстрый способ: Render.com

**2 минуты от регистрации до работающего приложения!**

1. **Регистрация**: [render.com](https://render.com) (можно через GitHub)
2. **New** → **Web Service** → **Deploy an existing image**
3. **Image**: `amochat/ai-chat:latest`
4. **Port**: `80` 
5. **Env Vars**: добавить `OPENAI_API_KEY`
6. **Create Web Service**

Готово! Ваш AI Chat работает в продакшене! 🚀

## Troubleshooting

**Проблема**: Приложение не запускается
**Решение**: Проверьте, что указан правильный порт `80` и добавлен API ключ

**Проблема**: API не работает
**Решение**: Убедитесь, что переменная `OPENAI_API_KEY` установлена

**Проблема**: Долго грузится
**Решение**: При первом запуске образ загружается ~2-3 минуты
