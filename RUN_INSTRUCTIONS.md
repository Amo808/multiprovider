# Development Guide

## Prerequisites

- **Python**: 3.8 or higher
- **Node.js**: 16.0 or higher  
- **Package Manager**: npm, yarn, or pnpm

## Project Structure

```
ai-chat/
├── backend/          # Python FastAPI API server
├── frontend/         # React + TypeScript web interface  
├── adapters/         # AI provider adapters
├── storage/          # Session and conversation management
├── data/            # Configuration and database
└── logs/            # Application logs (auto-created)
```

## Development Setup

### 1. Environment Setup

Create environment file:
```bash
# Copy example
cp .env.example .env

# Edit with your API keys
nano .env
```

Required environment variables:
```bash
# At least one API key required
OPENAI_API_KEY=your_openai_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here  
ANTHROPIC_API_KEY=your_anthropic_key_here
GOOGLE_API_KEY=your_google_key_here

# Optional settings
PORT=8000
NODE_ENV=development
LOG_LEVEL=INFO
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start server
python main.py
```

Backend will start on: `http://localhost:8000`

### 3. Frontend Setup

Open new terminal:
```bash
cd frontend

# Install dependencies  
npm install

# Start development server
npm run dev
```

Frontend will start on: `http://localhost:3000`

## Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000  
- **API Documentation**: http://localhost:8000/docs

## Provider Configuration

1. Open application in browser
2. Click "Provider Settings" button
3. Add API keys for desired providers
4. Click "Test Connection" to verify
5. Use "Refresh Models" to update available models

## Troubleshooting

### Backend Issues

**Server won't start:**
- Ensure virtual environment is activated
- Check all dependencies are installed: `pip install -r requirements.txt`
- Verify port 8000 is available

**Provider errors:**
- Check API keys are valid
- Test connections in Provider Settings
- Check logs in `/logs/app.log`

### Frontend Issues

**Development server won't start:**
- Ensure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check port 3000 is available

**"Loading configuration..." stuck:**
- Verify backend is running on port 8000
- Check browser console for errors
- Ensure CORS is configured correctly

### Network Issues

**API requests failing:**
- Check if backend is accessible: `curl http://localhost:8000/health`
- Verify Vite proxy configuration in `vite.config.ts`
- Check firewall settings

## Development Commands

### Backend
```bash
# Run with auto-reload
python main.py

# Run tests
python -m pytest

# Check code style
black . && isort .
```

### Frontend  
```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Linting
npm run lint
```

## Platform-Specific Notes

### Windows
- Use `py` instead of `python` if Python launcher is installed
- Use PowerShell or Command Prompt
- Paths use backslashes: `backend\main.py`

### macOS/Linux
- Use `python3` if multiple Python versions installed
- Use forward slashes: `backend/main.py`
- May need `sudo` for some installations

### Docker
```bash
# Build and run entire application
docker-compose up --build

# Run only backend
docker-compose up backend

# Run only frontend  
docker-compose up frontend
```


