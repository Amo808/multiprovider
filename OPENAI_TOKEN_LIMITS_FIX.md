# OpenAI Token Limits Fix (GPT-4o Issue)

## Проблема
GPT-4o возвращает ошибку 400 при попытке использовать 131,072 токена:
```
max_tokens is too large: 131072. This model supports at most 16384 completion tokens
```

## Причина
В `GenerationSettings.tsx` fallback логика для OpenAI возвращала 131,072 токена для всех моделей, 
но GPT-4o поддерживает только 16,384 токена.

## Исправление

### 1. Обновлены максимальные лимиты для OpenAI:
```tsx
case 'openai':
  const modelId = currentModel?.id?.toLowerCase() || '';
  const modelName = currentModel?.name?.toLowerCase() || '';
  
  // GPT-5 series - high limits  
  if (modelId.includes('gpt-5') || modelName.includes('gpt-5')) {
    return 131072; // GPT-5: 128K output tokens
  }
  
  // GPT-4.1 series
  if (modelId.includes('gpt-4.1') || modelName.includes('gpt-4.1')) {
    return 65536; // GPT-4.1: 64K output tokens
  }
  
  // O3/O4 reasoning series
  if (modelId.includes('o3') || modelId.includes('o4')) {
    return 65536; // O3/O4: 64K output tokens
  }
  
  // O1 reasoning series
  if (modelId.includes('o1') || modelName.includes('o1')) {
    return 32768; // O1: 32K output tokens
  }
  
  // GPT-4o series - ВАЖНО: Лимит 16K!
  if (modelId.includes('gpt-4o') || modelName.includes('gpt-4o')) {
    return 16384; // GPT-4o: 16K output tokens (API enforced!)
  }
  
  // GPT-4 Turbo and legacy GPT-4
  if (modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4')) {
    return 16384; // GPT-4/Turbo: 16K output tokens
  }
  
  // GPT-3.5 series
  if (modelId.includes('gpt-3.5') || modelName.includes('gpt-3.5')) {
    return 4096; // GPT-3.5: 4K output tokens
  }
  
  // Conservative fallback
  return 16384;
```

### 2. Обновлены рекомендуемые значения:
```tsx
case 'openai':
  // GPT-5 series
  if (modelId.includes('gpt-5')) return 8192;
  
  // GPT-4.1 series  
  if (modelId.includes('gpt-4.1')) return 6144;
  
  // O3/O4 reasoning models
  if (modelId.includes('o3') || modelId.includes('o4')) return 8192;
  
  // O1 reasoning series
  if (modelId.includes('o1')) return 6144;
  
  // GPT-4o series - conservative due to 16K limit
  if (modelId.includes('gpt-4o')) return 4096;
  
  // GPT-4/GPT-4 Turbo
  if (modelId.includes('gpt-4')) return 4096;
  
  // GPT-3.5
  if (modelId.includes('gpt-3.5')) return 2048;
  
  return 4096; // Conservative default
```

## Правильные лимиты согласно OpenAI API docs:

### Максимальные output tokens:
- **GPT-4o / GPT-4o Mini**: 16,384 токенов ⚠️
- **GPT-5 / GPT-5 Mini / GPT-5 Nano**: 128,000 токенов
- **GPT-4.1**: 65,536 токенов  
- **O3 / O4**: 65,536 токенов
- **O1**: 32,768 токенов
- **GPT-4 Turbo**: 16,384 токенов
- **GPT-3.5 Turbo**: 4,096 токенов

### Рекомендуемые значения:
- **GPT-5**: 8,192 токенов
- **GPT-4.1**: 6,144 токенов
- **O3/O4**: 8,192 токенов (reasoning models need more)
- **O1**: 6,144 токенов
- **GPT-4o**: 4,096 токенов (conservative due to 16K limit)
- **GPT-4**: 4,096 токенов
- **GPT-3.5**: 2,048 токенов

## Приоритет использования лимитов:
1. `currentModel?.max_output_tokens` (из backend)
2. `currentModel?.recommended_max_tokens` (из backend)
3. Fallback по типу модели (исправлено)

## Результат:
✅ GPT-4o больше не будет пытаться установить 131K токенов
✅ Правильные лимиты для всех OpenAI моделей
✅ Корректные рекомендуемые значения
✅ API Error 400 исправлен

## Тестирование:
```bash
# GPT-4o с 16K токенов должно работать
curl -X POST http://localhost:8001/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "provider": "openai", "model": "gpt-4o", "config": {"max_tokens": 16000}}'
```

Status: ✅ FIXED
