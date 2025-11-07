# Anthropic Claude Models Update & Token Limits Fix

## Проблема
API Error 400: max_tokens: 32768 > 32000, which is the maximum allowed number of output tokens for claude-opus-4-1-20250805

## Решение
1. **Обновлены лимиты токенов** согласно официальной документации Anthropic
2. **Добавлены новые модели Claude 4.5** (ранее отсутствовали)
3. **Исправлены максимальные и рекомендуемые значения**

### Новые модели Claude 4.5 (добавлены)
- **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`): 64K токенов, лучший баланс для агентов и кодинга
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`): 64K токенов, самый быстрый с передовым интеллектом
- **Алиасы**: `claude-sonnet-4-5`, `claude-haiku-4-5` (автоматически указывают на последние снимки)

### Обновленные лимиты токенов (November 2025)
- **Claude Sonnet 4.5**: 64,000 токенов максимум (рек. 8,192)
- **Claude Haiku 4.5**: 64,000 токенов максимум (рек. 4,096)
- **Claude Opus 4.1**: 32,000 токенов максимум (рек. 8,192) - СТРОГО!

### Изменения в коде

#### 1. Backend: Новые модели в `adapters/anthropic_provider.py`
```python
# Добавлены новые Claude 4.5 модели
ModelInfo(
    id="claude-sonnet-4-5-20250929",
    name="claude-sonnet-4-5-20250929", 
    display_name="Claude Sonnet 4.5",
    max_output_tokens=64000,  # 64K max output
    recommended_max_tokens=8192  # Recommended default
),
ModelInfo(
    id="claude-haiku-4-5-20251001",
    name="claude-haiku-4-5-20251001",
    display_name="Claude Haiku 4.5", 
    max_output_tokens=64000,  # 64K max output
    recommended_max_tokens=4096  # Optimized for speed
)
```

#### 2. Frontend: Обновленные лимиты в `GenerationSettings.tsx`
```javascript
case 'anthropic':
  // Claude models official limits from Anthropic docs:
  if (currentModel?.name?.toLowerCase().includes('opus')) {
    return 32000; // Claude Opus: exactly 32K max (API enforced)
  }
  if (currentModel?.name?.toLowerCase().includes('sonnet') || 
      currentModel?.name?.toLowerCase().includes('haiku')) {
    return 64000; // Claude Sonnet 4.5 & Haiku 4.5: 64K max
  }
  return 64000; // Default for newer Claude models
```

## Источники
- [Anthropic Official Documentation](https://docs.anthropic.com/en/docs/about-claude/models)
- Claude API comparison table с точными лимитами max output tokens
- Model snapshots с датированными версиями для стабильности

## Тестирование
1. ✅ Backend: загружено 11 моделей Anthropic (было 9)
2. ✅ Frontend: корректные лимиты для каждой модели
3. ✅ Claude Opus: максимум 32,000 токенов (решена ошибка API)
4. ✅ Claude 4.5: новые модели доступны с лимитом 64,000 токенов

## Статус
✅ **Добавлены новые модели**: Claude Sonnet 4.5 и Claude Haiku 4.5  
✅ **Исправлены лимиты токенов**: соответствуют официальной документации  
✅ **Решена ошибка API**: Claude Opus больше не превышает 32K лимит  
✅ **Обновлен дефолт**: новая модель Claude Sonnet 4.5 по умолчанию
