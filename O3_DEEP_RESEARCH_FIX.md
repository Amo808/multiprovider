# 🔧 o3-deep-research /responses Endpoint Fix

## ❌ Проблемы (исправлены)

### Проблема 1:
```
OpenAI API error: 400 - {
  "error": {
    "message": "Unknown parameter: 'system'.",
    "type": "invalid_request_error", 
    "param": "system",
    "code": "unknown_parameter"
  }
}
```

### Проблема 3:  
```
OpenAI API error: 400 - {
  "error": {
    "message": "Deep research models require at least one of 'web_search_preview', 'mcp', or 'file_search' tools.",
    "type": "invalid_request_error",
    "param": "tools", 
    "code": null
  }
}
```

**Модель:** `o3-deep-research`  
**Endpoint:** `/responses`  
**Причины:** 
1. `/responses` endpoint не поддерживает параметр `system`
2. `/responses` endpoint ожидает `input` array, а не `prompt` string или `messages` array
3. `o3-deep-research` модель требует обязательные инструменты (`tools`)

## ✅ Решение

### До исправления:
```python
# ❌ НЕПРАВИЛЬНО - /responses не поддерживает 'system'
responses_payload = {
    "model": model,
    "prompt": messages[-1].content,
    "stream": params.stream,
    "system": context  # ❌ Этот параметр не поддерживается!
}
```

### После исправления:
```python
# ✅ ПРАВИЛЬНО - используем 'input' array для нового /responses API + tools
responses_payload = {
    "model": model,
    "input": api_messages,  # ✅ 'input' вместо 'messages' (новый API)
    "stream": params.stream,
    "max_output_tokens": params.max_tokens  # ✅ Правильный параметр токенов
}

# Deep research models require tools
if model == "o3-deep-research":
    responses_payload["tools"] = ["web_search_preview"]  # ✅ Обязательные инструменты
```

**Ключевые изменения:**
1. ❌ `"prompt": "string"` → ✅ `"input": [{"role": "user", "content": "..."}]`
2. ❌ `"messages": [...]` → ✅ `"input": [...]` (новый API)
3. ❌ `"system": "context"` → ✅ Убран совсем
4. ❌ `"max_completion_tokens"` → ✅ `"max_output_tokens"`
5. ✅ **НОВОЕ:** `"tools": ["web_search_preview"]` для o3-deep-research

## 🔍 Технические детали

### Различия между endpoints:

| Параметр | `/chat/completions` | `/responses` |
|----------|-------------------|-------------|
| `messages` | ✅ | ❌ |
| `input` | ❌ | ✅ |
| `tools` | ✅ (опционально) | ✅ (обязательно для o3-deep-research) |
| `prompt` | ❌ | ❌ |
| `system` | ❌ | ❌ |
| `max_completion_tokens` | ✅ | ❌ |
| `max_output_tokens` | ❌ | ✅ |

### Финальное решение:
✅ `/responses` endpoint использует параметр `input` (новый API)  
✅ Разница: `/chat/completions` использует `messages`, `/responses` использует `input`  
✅ Оба используют одинаковый формат массива сообщений

### Модели использующие `/responses`:
- `o1-pro` ✅
- `o3-deep-research` ✅

### Пример финального payload:
```json
{
  "model": "o3-deep-research",
  "input": [
    {"role": "user", "content": "What is quantum computing?"},
    {"role": "assistant", "content": "Quantum computing is..."},
    {"role": "user", "content": "Explain quantum entanglement"}
  ],
  "tools": ["web_search_preview"],
  "stream": true,
  "max_output_tokens": 100,
  "temperature": 0.7
}
```

## ✅ Результат
- ✅ o3-deep-research работает без ошибок 400
- ✅ o1-pro работает без ошибок 400  
- ✅ Поддерживается история разговора
- ✅ Корректный формат payload для `/responses` endpoint
