# Mem0 + Supabase Integration Guide

## 📋 Обзор

Этот документ описывает полную интеграцию **Mem0** (semantic memory layer) с вашей существующей **Supabase** базой данных для создания персонализированного AI-ассистента с долгосрочной памятью.

### Что такое Mem0?

Mem0 — это "memory layer" для AI, который автоматически:

* Извлекает важные факты из разговоров
* Хранит предпочтения пользователей
* Находит релевантные воспоминания через семантический поиск
* Дедуплицирует информацию

***

## 🚀 Быстрый старт (Render + Supabase)

### Шаг 1: Добавить Environment Variables в Render

Зайдите в Render Dashboard → Your Service → Environment:

```bash
# Включить Mem0
MEM0_ENABLED=1

# Connection string к Supabase (ВАЖНО!)
# Формат: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
MEM0_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres

# OpenAI API Key (должен уже быть)
OPENAI_API_KEY=sk-...
```

### Шаг 2: Получить Connection String из Supabase

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите ваш проект
3. Settings → Database → Connection string
4. Скопируйте **URI** (не Pooler!)
5. Замените `[YOUR-PASSWORD]` на реальный пароль

### Шаг 3: Создать таблицу в Supabase (SQL Editor)

Выполните в SQL Editor:

```sql
-- Проверить pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Mem0 создаст таблицу автоматически при первом запуске,
-- но можно создать вручную для контроля:

CREATE TABLE IF NOT EXISTS public.mem0_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    memory TEXT NOT NULL,
    hash TEXT UNIQUE NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Индекс для быстрого семантического поиска
CREATE INDEX IF NOT EXISTS idx_mem0_embedding 
    ON public.mem0_memories 
    USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_mem0_user_id 
    ON public.mem0_memories(user_id);
```

### Шаг 4: Redeploy на Render

После добавления environment variables:

1. Render Dashboard → Your Service
2. Manual Deploy → Deploy latest commit

***

## 📦 Зависимости

В `requirements.txt` уже добавлено:

```
mem0ai>=1.0.0
psycopg2-binary>=2.9.7
```

Mem0 автоматически установит необходимые зависимости для pgvector.

***

## ⚙️ Конфигурация

### Environment Variables

| Переменная | Описание | Обязательно |
|------------|----------|-------------|
| `MEM0_ENABLED` | `1` для включения | ✅ |
| `MEM0_DATABASE_URL` | Supabase connection string | ✅ |
| `OPENAI_API_KEY` | Для извлечения фактов и embeddings | ✅ |
| `MEM0_COLLECTION_NAME` | Название таблицы (default: `mem0_memories`) | ❌ |

### Connection String формат

```
postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
```

**Где найти:**

* `[PASSWORD]` - пароль базы данных (Settings → Database → Database password)
* `[PROJECT]` - reference ID проекта (видно в URL dashboard)

***

## 🔄 Как это работает

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER MESSAGE                                │
│                 "Привет, меня зовут Антон"                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   1. SEARCH MEMORIES                             │
│      mem0.search("Привет, меня зовут Антон", user_id)           │
│                                                                  │
│  Результат: [] (пока нет воспоминаний)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   2. GENERATE RESPONSE                           │
│                                                                  │
│  AI: "Приятно познакомиться, Антон!"                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                3. EXTRACT & SAVE MEMORIES                        │
│                                                                  │
│  mem0.add([user_msg, assistant_msg], user_id)                   │
│                                                                  │
│  ✅ Извлечено: "User's name is Anton"                           │
│  ✅ Сохранено в Supabase с embedding                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            СЛЕДУЮЩИЙ РАЗГОВОР (через день/неделю)               │
│                                                                  │
│  User: "Что ты помнишь обо мне?"                                │
│                                                                  │
│  1. Search → Found: ["User's name is Anton"]                    │
│  2. Context: "User Memories: - User's name is Anton"            │
│  3. AI: "Я помню, что тебя зовут Антон!"                        │
└─────────────────────────────────────────────────────────────────┘
```

***

## 🧪 Тестирование

### Проверить статус Mem0

```bash
# GET запрос к health endpoint (после интеграции)
curl https://your-app.onrender.com/api/memory/status
```

### Проверить в логах Render

После деплоя посмотрите логи:

```
✅ mem0 package available (Open Source version)
🐘 Mem0 configured with Supabase PGVector
✅ Mem0 memory store initialized with supabase-pgvector backend
```

### Тест сохранения памяти

```bash
curl -X POST https://your-app.onrender.com/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "messages": [
      {"role": "user", "content": "Меня зовут Антон, я программист"},
      {"role": "assistant", "content": "Рад познакомиться, Антон!"}
    ]
  }'
```

### Тест поиска

```bash
curl -X POST https://your-app.onrender.com/api/memory/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "Как меня зовут?"
  }'
```

***

## 📊 Стоимость

| Компонент | Стоимость | Примечание |
|-----------|-----------|------------|
| Mem0 (Open Source) | $0 | Self-hosted |
| Supabase Free Tier | $0 | 500MB storage |
| OpenAI Embeddings | ~$0.0001/1K tokens | text-embedding-3-small |
| OpenAI Extraction | ~$0.001/message | gpt-4o-mini |

**Примерная стоимость:** ~$0.001-0.005 за разговор

***

## 🔧 Troubleshooting

### Ошибка: "could not translate host name"

**Причина:** Неверный connection string

**Решение:** Проверьте формат:

```
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

### Ошибка: "permission denied for schema public"

**Причина:** Нет прав на создание таблиц

**Решение:** Создайте таблицу вручную через SQL Editor (см. Шаг 3)

### Ошибка: "extension vector does not exist"

**Причина:** pgvector не включен

**Решение:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Mem0 не инициализируется

**Проверьте:**

1. `MEM0_ENABLED=1` установлен
2. `MEM0_DATABASE_URL` корректный
3. `OPENAI_API_KEY` валидный
4. Логи Render на ошибки

***

## 🏗️ Архитектура

```
┌──────────────────────────────────────────────────────────────────┐
│                         RENDER                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    FastAPI Backend                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │   main.py    │  │ multi_model  │  │   mem0_store.py  │  │  │
│  │  │   (API)      │  │ (Chat Gen)   │  │   (Memory)       │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │  │
│  │         │                 │                    │            │  │
│  └─────────┼─────────────────┼────────────────────┼────────────┘  │
│            │                 │                    │               │
└────────────┼─────────────────┼────────────────────┼───────────────┘
             │                 │                    │
             ▼                 ▼                    ▼
┌────────────────────────────────────────────────────────────────────┐
│                          SUPABASE                                   │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │ PostgreSQL  │  │   pgvector    │  │     mem0_memories        │  │
│  │ (messages,  │  │  (embeddings) │  │  (user memories with     │  │
│  │  convos)    │  │               │  │   semantic search)       │  │
│  └─────────────┘  └───────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
             │                                       
             ▼                                       
┌────────────────────────────────────────────────────────────────────┐
│                          OPENAI                                     │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐    │
│  │  gpt-4o-mini     │  │  text-embedding-3-small              │    │
│  │  (fact extract)  │  │  (semantic embeddings)               │    │
│  └──────────────────┘  └──────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

***

## ✅ Checklist

### Пользователь (вы):

* \[ ] Получить Connection String из Supabase Dashboard
* \[ ] Добавить `MEM0_ENABLED=1` в Render Environment
* \[ ] Добавить `MEM0_DATABASE_URL` в Render Environment
* \[ ] Выполнить SQL для создания таблицы (опционально)
* \[ ] Redeploy на Render
* \[ ] Проверить логи на успешную инициализацию

### Copilot (я):

* \[x] Обновить `mem0_store.py` для поддержки Supabase PGVector
* \[ ] Добавить API endpoints для управления памятью
* \[ ] Интегрировать память в chat flow
* \[ ] Создать UI компонент для просмотра памяти (опционально)

***

## 🎯 Следующие шаги

После того как вы добавите environment variables и сделаете redeploy, скажите мне и я:

1. Добавлю API endpoints для работы с памятью
2. Интегрирую память в процесс генерации ответов
3. Добавлю UI для просмотра/управления памятью (опционально)

***

*Документ создан: 7 января 2026*
*Версия: 2.0 (Render + Supabase focused)*
