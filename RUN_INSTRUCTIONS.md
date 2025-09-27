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
```

Add required variables:
```bash
# Provider API keys (add the ones you use)
OPENAI_API_KEY=your_openai_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here  
ANTHROPIC_API_KEY=your_anthropic_key_here

# Google OAuth + JWT auth
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_long_random_secret  # e.g. openssl rand -hex 32
JWT_EXPIRES=60                      # minutes (optional)

# App
PORT=8000
CORS_ORIGINS=http://localhost:3000
```

Frontend `.env.local`:
```bash
VITE_GOOGLE_CLIENT_ID=your_google_client_id
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

### 3. Frontend Setup

Open new terminal:
```bash
cd frontend

# Install dependencies  
npm install

# Start development server
npm run dev
```

### 4. Login Flow
1. Open http://localhost:3000
2. Click "Sign in with Google"
3. After successful Google auth the backend returns a JWT
4. JWT stored in `localStorage` as `jwt_token` and sent with all API requests

## Access Points

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Provider Configuration

1. After login open Provider Settings
2. Enter API keys
3. Test connection / Refresh models
4. Select model and start chatting

## Troubleshooting

### Authentication
- 401 errors: check JWT present in devtools request headers
- Invalid Google token: verify correct GOOGLE_CLIENT_ID matches the one configured in Google Cloud Console
- Token expired: re-login (token lifetime controlled by JWT_EXPIRES)

### Backend
- Ensure environment variables loaded (`printenv` / `.env` present)
- Check logs: `logs/app.log`

### Frontend
- Missing Google button: ensure script tag in `index.html` or correct VITE_GOOGLE_CLIENT_ID
- CORS issues: ensure backend CORS_ORIGINS includes frontend origin

## Docker
```bash
docker-compose up --build
```

## Linting & Quality
```bash
# Backend
black . && isort .

# Frontend
npm run lint
npm run type-check
```

## Next (Optional)
- Add refresh token endpoint and HttpOnly cookie
- Store users (email, created_at) in DB
- Add rate limiting per user


