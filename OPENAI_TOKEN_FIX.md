# OpenAI Provider Token Fix Documentation

## Исправленные проблемы

### 1. Исчезновение счетчика токенов для GPT-5

**Проблема:** GPT-5 не показывал счетчик токенов в конце ответа из-за дублированного финального response.

**Решение:** Объединили логику финального response для всех моделей, включая GPT-5:

```python
# Финальный response с полной информацией о токенах для ВСЕХ моделей (включая GPT-5)
final_output_tokens = self.estimate_tokens(accumulated_content) if accumulated_content else output_tokens

final_meta = {
    "tokens_in": input_tokens,
    "tokens_out": final_output_tokens,
    "total_tokens": input_tokens + final_output_tokens,
    "provider": ModelProvider.OPENAI,
    "model": model,
    "estimated_cost": self._calculate_cost(input_tokens, final_output_tokens, model)
}

# Добавляем специальный флаг для GPT-5
if is_gpt5:
    final_meta["openai_completion"] = True
```

### 2. Ошибка 400 для o3-deep-research и o1-pro

**Проблема:** Модели o3-deep-research и o1-pro используют `/responses` endpoint, который требует параметр `max_output_tokens` вместо `max_completion_tokens`.

**Решение:** Добавлена корректная обработка параметров для `/responses` endpoint:

```python
if uses_responses_endpoint:
    url = f"{self.base_url}/responses"
    # ...
    if params.max_tokens:
        responses_payload["max_output_tokens"] = params.max_tokens  # ✅ Исправлено
```

## Технические детали

### Heartbeat и Streaming для GPT-5

Интегрированы сигналы heartbeat/streaming как в ChatGPT Pro provider:

- **Heartbeat**: каждые 10 секунд для поддержания соединения
- **Streaming Ready**: сигнал о готовности к streaming
- **First Content**: сигнал при получении первого контента
- **Background Monitoring**: мониторинг таймаутов (3 минуты)

### Улучшенное логирование

Добавлено детальное логирование для отладки:

```python
self.logger.debug(f"💓 [GPT-5] Heartbeat signal sent")
self.logger.info(f"🚀 [GPT-5] Streaming ready signal sent")
self.logger.info(f"🎯 [GPT-5] First content received")
```

### Обработка больших запросов

Early warning для запросов больше 30k символов:

```python
if is_gpt5 and len(str(messages)) > 30000:
    self.logger.warning(f"⚠️ [GPT-5] Large request detected ({len(str(messages))} chars)")
```

## Результат

✅ **GPT-5**: Теперь корректно показывает счетчик токенов в конце ответа  
✅ **o3-deep-research**: Работает без ошибок 400  
✅ **o1-pro**: Работает без ошибок 400  
✅ **Все модели**: Имеют стабильное streaming и heartbeat для длинных запросов  
✅ **UX**: Улучшен пользовательский опыт с предупреждениями и мониторингом

## Тестирование

Используйте `test_openai_tokens_fix.py` для проверки:

```bash
python test_openai_tokens_fix.py
```

Тест проверяет:
- Наличие токенов в финальном response
- Корректность работы разных моделей
- Отсутствие ошибок API
