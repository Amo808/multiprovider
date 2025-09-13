# ⚡ Heartbeat System для GPT-5 - Минимальное Добавление

## 🎯 Что добавлено:

### 1. **Heartbeat логика в OpenAI Provider**
Добавлена только для GPT-5 моделей, не влияет на другие модели:

```python
# В streaming секции
is_gpt5 = model.startswith('gpt-5')

# Heartbeat каждые 10 секунд для GPT-5
if is_gpt5 and current_time - last_heartbeat > heartbeat_interval:
    yield ChatResponse(
        heartbeat="GPT-5 processing... connection active",
        meta={"elapsed_time": current_time - start_time}
    )
```

### 2. **Дополнительные сигналы для GPT-5**
- `streaming_ready`: В начале streaming
- `first_content`: При получении первого chunk'а контента

### 3. **Что НЕ изменено**
- ✅ Frontend интерфейс остался тот же
- ✅ Нет перезагрузки страницы при смене провайдера
- ✅ Все обработчики уже существовали в frontend
- ✅ ChatGPT Pro provider уже имел свою heartbeat систему

## 🔧 Технические детали:

```python
# Добавлено в adapters/openai_provider.py
start_time = asyncio.get_event_loop().time()
last_heartbeat = start_time
heartbeat_interval = 10
first_content_chunk = True
is_gpt5 = model.startswith('gpt-5')

# Streaming ready signal для GPT-5
if is_gpt5:
    yield ChatResponse(streaming_ready=True)

# Heartbeat каждые 10 секунд
if is_gpt5 and current_time - last_heartbeat > heartbeat_interval:
    yield ChatResponse(heartbeat="...")

# First content signal
if is_gpt5 and first_content_chunk:
    yield ChatResponse(first_content=True)
```

## ✅ Результат:
- **Минимальное вмешательство** - добавлено только для GPT-5
- **Нет нарушения UI** - страница не перезагружается
- **Heartbeat поддержка** - для длинных GPT-5 запросов
- **Совместимость** - работает с существующим frontend

**Проблема таймаутов для GPT-5 должна быть решена без нарушения работы интерфейса!**
