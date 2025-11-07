# 🚀 Release Notes - November 7, 2025

## 🎯 Major Update: Claude 4.5 Support + Token Limits Fix

### ✨ What's New
- **Claude Sonnet 4.5** - Smart model for complex agents and coding (64K tokens)
- **Claude Haiku 4.5** - Fastest model with near-frontier intelligence (64K tokens) 
- **Auto Token Limits** - Automatically adjusts max_tokens based on selected model
- **Dev Mode Ready** - Full Google OAuth bypass for development

### 🔧 Critical Fixes
- **Claude Opus Token Limit** - Fixed 32K max (was causing API errors)
- **UI Synchronization** - Real-time settings sync between frontend and backend
- **Model Validation** - Proper token limit validation for all providers

### 🧹 Project Cleanup
- Removed 10+ outdated documentation files
- Cleaned up deployment scripts and backups
- Streamlined project structure and .gitignore
- Updated README with current setup

### 📊 Current Status
- **Backend**: 11 Anthropic models loaded
- **Frontend**: Running on localhost:3001
- **Backend API**: Running on localhost:8001
- **Dev Mode**: ✅ Active (no Google OAuth needed)

### 🚀 Ready to Use
```bash
# Backend
cd multiprovider
py backend/main.py

# Frontend (new terminal)
cd frontend
npm run dev
```

### 📚 Documentation
- `SETUP.md` - Complete installation guide
- `ANTHROPIC_LIMITS_FIX.md` - Technical details of fixes
- `README.md` - Updated project overview

All changes pushed to **main** branch ✅
