# 🚀 Deployment Guide

## Local Development

### Quick Start
```bash
# Backend (from backend folder)
.venv\Scripts\python main.py --timeout 300

# Frontend (from frontend folder)  
npm run dev
```

### Expected URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Production Deployment

### Docker (Recommended)
```bash
docker-compose up --build
```

### Manual Production Setup

1. **Environment Variables**
```bash
OPENAI_API_KEY=your_key_here
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_client_id
PORT=8000
```

2. **Build & Deploy**
```bash
# Frontend build
cd frontend && npm run build

# Backend with Gunicorn
cd backend
gunicorn main:app \
  --bind 0.0.0.0:$PORT \
  --workers 2 \
  --worker-class uvicorn.workers.UvicornWorker \
  --timeout 300
```

## Key Features
- ✅ Extended 300s timeout for GPT-5 reasoning
- ✅ Heartbeat system prevents connection drops
- ✅ Dev mode bypass for quick testing
- ✅ Multi-provider support (OpenAI, DeepSeek, Anthropic, Gemini)
- ✅ Real-time streaming responses

## Troubleshooting

### Common Issues
1. **Build fails**: Check all dependencies installed
2. **API errors**: Verify API keys in environment
3. **Connection timeout**: Ensure 300s timeout configured
4. **Auth issues**: Enable dev mode for testing

### Debug Commands
```bash
# Test backend health
curl http://localhost:8000/health

# Check config
curl http://localhost:8000/api/config
```
