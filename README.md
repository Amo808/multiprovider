# AI Chat - Multi-Provider Assistant

🚀 **Professional AI chat application** with support for multiple providers and GPT-5 optimized features.

## ✨ Key Features
- **Multi-Provider Support**: OpenAI (GPT-5), DeepSeek, Anthropic, Gemini
- **Smart Token Limits**: Auto-adjusts max_tokens based on model capabilities
- **Extended Timeouts**: 5+ minute support for complex reasoning tasks
- **Real-time Streaming**: Live responses with heartbeat monitoring
- **Conversation History**: Persistent chat sessions
- **Modern UI**: React + Tailwind with dark/light themes
- **Dev Mode**: Bypass authentication for quick testing

## ⚡ Quick Start

### 1. Install Dependencies
```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Frontend  
cd ../frontend
npm install
```

### 2. Run Application
```bash
# Terminal 1: Backend (from backend folder)
.venv\Scripts\python main.py --timeout 300

# Terminal 2: Frontend (from frontend folder)
npm run dev
```

### 3. Access App
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 🔧 Configuration

### Environment Variables (.env)
```bash
# AI Provider API Keys
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key  
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key

# Authentication (optional for dev)
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret

# Dev Mode (bypass Google Auth)
DEV_MODE=1
FORCE_DEV_AUTH=1
BYPASS_GOOGLE_AUTH=1

# App Settings
PORT=8000
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)
```bash
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_DEV_MODE=1
```

## 🔧 Dev Mode Setup
For quick testing without Google OAuth:
1. Set the dev mode variables in `.env` as shown above
2. Set `VITE_DEV_MODE=1` in `frontend/.env.local`
3. App will bypass login and use `dev@example.com` user

## 🚀 Production Deployment

### Docker (Recommended)
```bash
docker-compose up --build
```

### Manual Deployment
1. Set environment variables
2. Build frontend: `npm run build`
3. Start backend with production settings
4. Configure reverse proxy (nginx/Apache)

## 📁 Project Structure
```
multiprovider/
├── backend/          # Python FastAPI server
├── frontend/         # React TypeScript app
├── adapters/         # AI provider adapters  
├── storage/          # Database & session storage
├── data/            # Configuration files
└── logs/            # Application logs
```

## 🛠️ Development

### Adding New AI Providers
1. Create adapter in `adapters/` folder
2. Register in `provider_manager.py`
3. Add configuration to `data/providers_config.json`

### API Documentation
- Interactive docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

## 📄 License
MIT License - see LICENSE file for details
