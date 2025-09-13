# 🔧 o3-deep-research /responses Endpoint Fix

## ❌ Проблема
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

**Модель:** `o3-deep-research`  
**Endpoint:** `/responses`  
**Причина:** `/responses` endpoint не поддерживает параметр `system`

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
# ✅ ПРАВИЛЬНО - объединяем все сообщения в один prompt
if len(messages) > 1:
    context_messages = messages[:-1]  # Все кроме последнего
    current_prompt = messages[-1].content
    
    # Строим полный prompt с историей разговора
    full_prompt = ""
    for msg in context_messages:
        full_prompt += f"{msg.role.title()}: {msg.content}\n\n"
    full_prompt += f"User: {current_prompt}"
    
    responses_payload = {
        "model": model,
        "prompt": full_prompt,  # ✅ Вся история в одном prompt
        "stream": params.stream,
        "max_output_tokens": params.max_tokens
    }
```

## 🔍 Технические детали

### Различия между endpoints:

| Параметр | `/chat/completions` | `/responses` |
|----------|-------------------|-------------|
| `messages` | ✅ | ❌ |
| `prompt` | ❌ | ✅ |
| `system` | ❌ | ❌ |
| `max_completion_tokens` | ✅ | ❌ |
| `max_output_tokens` | ❌ | ✅ |

### Модели использующие `/responses`:
- `o1-pro` ✅
- `o3-deep-research` ✅

### Пример сформированного prompt:
```
User: What is quantum computing?
