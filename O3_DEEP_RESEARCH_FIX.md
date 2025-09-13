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

### Проблема 2:  
```
OpenAI API error: 400 - {
  "error": {
    "message": "Invalid type for 'prompt': expected an object, but got a string instead.",
    "type": "invalid_request_error",
    "param": "prompt", 
    "code": "invalid_type"
  }
}
```

**Модель:** `o3-deep-research`  
**Endpoint:** `/responses`  
**Причины:** 
1. `/responses` endpoint не поддерживает параметр `system`
2. `/responses` endpoint ожидает `messages` array, а не `prompt` string

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
# ✅ ПРАВИЛЬНО - используем 'input' array для нового /responses API
responses_payload = {
    "model": model,
    "input": api_messages,  # ✅ 'input' вместо 'messages' (новый API)
    "stream": params.stream,
    "max_output_tokens": params.max_tokens  # ✅ Правильный параметр токенов
}
```

**Ключевые изменения:**
1. ❌ `"prompt": "string"` → ✅ `"input": [{"role": "user", "content": "..."}]`
2. ❌ `"messages": [...]` → ✅ `"input": [...]` (новый API)
3. ❌ `"system": "context"` → ✅ Убран совсем
4. ❌ `"max_completion_tokens"` → ✅ `"max_output_tokens"`

## 🔍 Технические детали

### Различия между endpoints:

| Параметр | `/chat/completions` | `/responses` |
|----------|-------------------|-------------|
| `messages` | ✅ | ❌ |
| `input` | ❌ | ✅ |
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
