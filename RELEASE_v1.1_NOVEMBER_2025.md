# Multiprovider v1.1 - November 2025 Release

## 🚀 Major Updates

### ✅ Fixed All API Errors
- **Anthropic Claude Opus**: Исправлена ошибка max_tokens > 32000
- **Anthropic Claude 3.5**: Удалены несуществующие модели (404 ошибки)
- **Google Gemini**: Обновлены ID моделей и убраны неподдерживаемые функции

### ✅ Added Latest AI Models

#### 🆕 Claude 4.5 Models (NEW!)
- **Claude Sonnet 4.5** - лучший баланс для агентов и кодинга (64K токенов)
- **Claude Haiku 4.5** - самый быстрый с передовым интеллектом (64K токенов)
- **Claude Opus 4.1** - исправлен лимит до 32K токенов (СТРОГО!)

#### 🔄 Updated Gemini Models
- **Gemini 2.5 Flash** - лучшее соотношение цены и производительности
- **Gemini 2.5 Flash Lite** - самая быстрая и экономичная
- **Gemini 2.0 Flash Experimental** - модель 2-го поколения
- **Gemini 1.5 Pro/Flash** - исправленные ID без `-latest`

### ✅ Technical Improvements

#### Frontend Updates
- Автоматическая коррекция max_tokens при смене модели
- Быстрые кнопки "Default" и "Max" для настройки токенов
- Синхронизация настроек между UI и API
- Поддержка всех лимитов новых моделей

#### Backend Updates  
- Загружено **8 моделей Anthropic** (добавлены 4.5, удалены неработающие)
- Загружено **6 актуальных моделей Gemini** 
- Корректные лимиты токенов согласно официальным API
- Dev mode активен для разработки

#### Configuration
- Обновлены .env файлы для dev mode
- Исправлены CORS настройки
- Обновлены API ключи
- Порт изменен на 8001

## 📊 Model Statistics

### Providers Status
- ✅ **Anthropic**: 8 models (Claude 4.5 + legacy)
- ✅ **Google Gemini**: 6 models (2.5/2.0/1.5/1.0 generations)  
- ✅ **DeepSeek**: 2 models (chat + reasoner)
- ✅ **OpenAI**: 68 models (GPT-4o, GPT-3.5, etc.)

### Token Limits (Corrected)
- **Claude Sonnet 4.5**: 64,000 max (rec. 8,192)
- **Claude Haiku 4.5**: 64,000 max (rec. 4,096)
- **Claude Opus 4.1**: 32,000 max (rec. 8,192) - API ENFORCED
- **Gemini 2.5**: 32,768 max (rec. 8,192)
- **DeepSeek Reasoner**: 65,536 max (rec. 32,768)
- **DeepSeek Chat**: 8,192 max (rec. 4,096)

## 🛠️ Development Setup

### Quick Start
```bash
# Backend (Python)
cd multiprovider
py backend/main.py
# → Backend running on http://localhost:8001

# Frontend (React + Vite)
cd frontend
npm run dev  
# → Frontend running on http://localhost:3001
```

### Dev Mode Features
- ✅ Google OAuth bypass активен
- ✅ Все API провайдеры работают
- ✅ Автоматическая коррекция настроек
- ✅ Hot reload для разработки

## 📚 Documentation Updates

- **ANTHROPIC_LIMITS_FIX.md** - детальное описание исправлений
- **README.md** - обновленные инструкции
- **.gitignore** - оптимизирован для проекта
- **dev режим** - документирован в .env

## 🔗 Sources

- [Anthropic Claude API Documentation](https://docs.anthropic.com/en/docs/about-claude/models)
- [Google Gemini API Documentation](https://ai.google.dev/gemini-api/docs/models/gemini) 
- [DeepSeek API Documentation](https://platform.deepseek.com/api-docs)
- [OpenAI API Documentation](https://platform.openai.com/docs/models)

## 🎯 Ready for Production

✅ All API errors resolved  
✅ Latest models from all providers  
✅ Correct token limits enforced  
✅ Dev environment fully functional  
✅ Documentation updated  
✅ Git repository organized
