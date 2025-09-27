# AI Chat - Multi-Provider Assistant

[![GitHub stars](https://img.shields.io/github/stars/Amo808/multiprovider?style=social)](https://github.com/Amo808/multiprovider)
[![Deploy to Render](https://img.shields.io/badge/Deploy%20to-Render-46E3B7.svg)](https://render.com/deploy?repo=https://github.com/Amo808/multiprovider)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Professional AI chat application with support for multiple providers (OpenAI, DeepSeek, Anthropic, Gemini).

## 🔐 Authentication (Google OAuth + JWT)
The application now uses **Google OAuth 2.0** for login. After Google sign-in the backend issues a short-lived **JWT** used for all `/api/*` calls.

Environment variables required:
```
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=strong_random_string
JWT_EXPIRES=60   # minutes (optional)
```
Frontend build also needs:
```
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```
Legacy password auth has been removed.

## 🚀 Quick Start

### Prerequisites
- **Python**: 3.8+
- **Node.js**: 16+
- **Git**: Latest version

### Local Development

1. **Clone & Setup**
   ```bash
   git clone https://github.com/Amo808/multiprovider.git
   cd multiprovider
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS/Linux  
   source .venv/bin/activate
   pip install -r requirements.txt
   python main.py
   ```

3. **Frontend Setup** (new terminal)
   ```bash
   cd frontend
   npm install
   # create .env.local with VITE_GOOGLE_CLIENT_ID
   echo "VITE_GOOGLE_CLIENT_ID=your_google_client_id" > .env.local
   npm run dev
   ```

4. **Access Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Features

✅ **Google OAuth Login**  
✅ **Multi-Provider Support**: OpenAI, DeepSeek, Anthropic, Gemini  
✅ **Real-time Chat**: Streaming responses  
✅ **Conversation History**: Persistent sessions  
✅ **Provider Management**: API key configuration & testing  
✅ **Modern UI**: React + Tailwind, dark/light themes  

## Deployment

### Render
Add the following environment variables in the Render service:
```
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_CLIENT_ID=...
JWT_SECRET=... (generate with: openssl rand -hex 32)
JWT_EXPIRES=60
```
Frontend build: ensure `VITE_GOOGLE_CLIENT_ID` is set (either baked into Docker build or passed at build time).

### Docker (Full Stack)
```bash
docker-compose up --build
```

## Configuration
Environment variables (partial):
```
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:3000
```

## Provider Setup
1. Login via Google
2. Open Provider Settings
3. Enter API keys
4. Test connection / Refresh models
5. Start chatting

## Documentation
- Development: `RUN_INSTRUCTIONS.md`
- Deployment: `DEPLOYMENT.md`
- Auth (legacy note): `DEPLOY_AUTH.md`

## Roadmap
- Optional refresh tokens
- User roles & usage limits
- Usage analytics endpoint

## License
MIT
