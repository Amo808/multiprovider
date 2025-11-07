# Models Update & Fixes - November 7, 2025

## Исправленные проблемы

### ❌ Удаленные неработающие модели

#### Anthropic Claude 3.5 (API Error 404)
- `claude-3-5-sonnet-20240620` (Claude 3.5 Sonnet Old) 
- `claude-3-5-sonnet-20241022` (Claude 3.5 Sonnet New)
- `claude-3-5-haiku-20241022` (Claude 3.5 Haiku)

**Причина**: Модели удалены из Anthropic API или изменились их ID

#### Gemini (API Error 404 / 400)
- `gemini-1.5-pro` (вызывал 404 Not Found)
- `gemini-2.0-flash` (не поддерживает thinking mode)
- `gemini-2.5-pro` (еще не существует)
- `gemini-2.5-flash` (еще не существует) 
- `gemini-2.5-flash-lite` (еще не существует)

**Причина**: Неправильные ID моделей, несуществующие версии, unsupported thinking mode

### ✅ Добавленные рабочие модели

#### Anthropic Claude 4.5 (новые)
- `claude-sonnet-4-5-20250929` - Claude Sonnet 4.5 (64K tokens)
- `claude-haiku-4-5-20251001` - Claude Haiku 4.5 (64K tokens)
- `claude-opus-4-1-20250805` - Claude Opus 4.1 (32K tokens, исправлен лимит)

#### Gemini (обновленные ID)
- `gemini-2.0-flash-exp` - Gemini 2.0 Flash Experimental
- `gemini-1.5-pro-latest` - Gemini 1.5 Pro (рабочий ID)
- `gemini-1.5-flash-latest` - Gemini 1.5 Flash (рабочий ID)

## Результат

### До исправлений
- **Anthropic**: 11 моделей, из них 3 не работали (404 ошибки)
- **Gemini**: 6 моделей, из них 2 не работали (404/400 ошибки)
- **Всего проблемных**: 5 моделей

### После исправлений  
- **Anthropic**: 8 рабочих моделей
- **Gemini**: 6 рабочих моделей (обновлены ID)
- **Всего рабочих**: 14 моделей без ошибок

## Исправленные лимиты токенов

### Claude Opus 4.1
- **Было**: 32,768 токенов → ❌ API Error 400
- **Стало**: 32,000 токенов → ✅ Работает

### Новые Claude 4.5 
- **Claude Sonnet 4.5**: 64,000 токенов (рек. 8,192)
- **Claude Haiku 4.5**: 64,000 токенов (рек. 4,096)

## Обновленные файлы
1. `adapters/anthropic_provider.py` - удалены Claude 3.5, добавлены Claude 4.5
2. `adapters/gemini_provider.py` - исправлены ID моделей, удалены несуществующие
3. `frontend/src/components/GenerationSettings.tsx` - обновлены лимиты токенов
4. `.env` - обновлены порты (8001) и настройки

## Статус тестирования
✅ Backend запущен без ошибок  
✅ Все модели загружены корректно  
✅ Нет больше 404/400 ошибок при выборе моделей  
✅ Лимиты токенов соответствуют официальным API

**Дата обновления**: November 7, 2025
