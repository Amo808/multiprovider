# Model-Specific Settings Memory Fix

## Проблемы которые были исправлены:

### 1. Настройки не запоминались между моделями
**Проблема**: При переключении между моделями все настройки сбрасывались, не было памяти для каждой модели отдельно.

**Решение**: 
- Добавлено сохранение настроек в localStorage для каждой комбинации провайдер/модель
- Ключ формата: `model-settings-{provider}-{modelId}`
- При смене модели старые настройки автоматически сохраняются, новые загружаются

### 2. max_tokens сбрасывался на рекомендуемые значения вместо максимальных
**Проблема**: При смене модели max_tokens устанавливался на `getRecommendedMaxTokens()` вместо `getMaxTokens()`.

**Решение**:
- Изменена логика: при первой загрузке модели используются максимальные токены
- Если есть сохраненные настройки для модели, используются они
- Только при отсутствии и того и другого используются максимальные лимиты

## Изменения в коде:

### Новые функции:
```tsx
// Уникальный ключ для каждой модели
const getModelKey = (provider?: ModelProvider, modelId?: string) => {
  if (!provider || !modelId) return 'default';
  return `${provider}-${modelId}`;
};

// Загрузка настроек модели из localStorage
const loadModelSettings = (provider?: ModelProvider, modelId?: string): Partial<GenerationConfig> => {
  // Загружает temperature, max_tokens, top_p и др. для конкретной модели
};

// Сохранение настроек модели в localStorage
const saveModelSettings = (provider?: ModelProvider, modelId?: string, settings?: Partial<GenerationConfig>) => {
  // Сохраняет настройки для конкретной модели
};
```

### Изменения в логике:
```tsx
// Обработка смены модели/провайдера
useEffect(() => {
  const hasModelChanged = // проверка смены модели
  
  if (hasModelChanged) {
    // 1. Сохранить текущие настройки для предыдущей модели
    saveModelSettings(previousProvider, previousModel, localConfig);
    
    // 2. Загрузить сохраненные настройки для новой модели
    const savedSettings = loadModelSettings(currentProvider, currentModelId);
    
    // 3. Применить настройки или максимальные токены по умолчанию
    const newConfig = {
      ...localConfig,
      ...savedSettings,
      max_tokens: savedSettings.max_tokens || getMaxTokens() // МАКСИМАЛЬНЫЕ, не рекомендуемые
    };
  }
}, [currentProvider, currentModel?.id]);

// Автоматическое сохранение при каждом изменении
const handleChange = (key, value) => {
  // Обновить настройки
  // Автоматически сохранить в localStorage для текущей модели
  saveModelSettings(currentProvider, currentModel?.id, newConfig);
};
```

## Сохраняемые настройки для каждой модели:
- `temperature` - Температура
- `max_tokens` - Максимальные токены
- `top_p` - Top P
- `presence_penalty` - Presence penalty
- `frequency_penalty` - Frequency penalty  
- `thinking_budget` - Thinking budget (для Gemini)
- `include_thoughts` - Include thoughts (для Gemini)
- `reasoning_effort` - Reasoning effort (для OpenAI)
- `verbosity` - Verbosity (для OpenAI)
- `cfg_scale` - CFG Scale (для OpenAI)
- `free_tool_calling` - Free tool calling (для OpenAI)

## Поведение по умолчанию:
1. **Первое открытие модели**: используются максимальные токены (`getMaxTokens()`)
2. **Повторное открытие модели**: загружаются сохраненные настройки
3. **Изменение настроек**: автоматическое сохранение в localStorage
4. **Кнопки Default/Max**: позволяют быстро установить рекомендуемые или максимальные значения

## Примеры ключей в localStorage:
- `model-settings-gemini-gemini-2.5-flash` - настройки для Gemini 2.5 Flash
- `model-settings-anthropic-claude-sonnet-4.5` - настройки для Claude Sonnet 4.5
- `model-settings-deepseek-deepseek-chat` - настройки для DeepSeek Chat
- `model-settings-openai-gpt-4` - настройки для GPT-4

## Результат:
✅ Каждая модель теперь "помнит" свои настройки
✅ max_tokens по умолчанию устанавливается на максимальные значения
✅ Автоматическое сохранение при каждом изменении
✅ Плавное переключение между моделями без потери настроек
✅ Сохраняется между сессиями (localStorage)
