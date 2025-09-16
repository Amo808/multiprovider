# AI Chat - Multi-Provider Assistant

Professional AI chat application with support for multiple providers (OpenAI, DeepSeek, Anthropic, Gemini).

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
   npm run dev
   ```

4. **Access Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Features

✅ **Multi-Provider Support**: OpenAI, DeepSeek, Anthropic, Gemini  
✅ **Real-time Chat**: Streaming responses with fallback support  
✅ **Conversation History**: Persistent chat sessions  
✅ **Provider Management**: API key configuration and testing  
✅ **Modern UI**: React with dark/light theme support  
✅ **Responsive Design**: Works on desktop and mobile  

## Deployment

### Docker (Recommended)
```bash
# Build and run
docker-compose up --build

# Or use pre-built image
docker run -p 3000:3000 -p 8000:8000 ai-chat
```

### Cloud Platforms

**Render.com** (Free tier available):
1. Connect your GitHub repository
2. Render will auto-detect Dockerfile
3. Add environment variables for API keys
4. Deploy automatically

**Vercel/Netlify** (Frontend):
- Deploy frontend separately
- Configure backend URL in environment

**Railway/Fly.io** (Full-stack):
- Deploy entire application
- Configure environment variables
- Auto-scaling available

### VPS Deployment
```bash
# Clone repository
git clone https://github.com/Amo808/multiprovider.git
cd multiprovider

# Run installation script
chmod +x deploy.sh
./deploy.sh
```

## Configuration

### Environment Variables
```bash
# Required: At least one API key
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key  
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Optional: Application settings
PORT=8000
NODE_ENV=production
CORS_ORIGINS=http://localhost:3000
```

### Provider Setup
1. Open application in browser
2. Click "Provider Settings"
3. Add your API keys
4. Test connections
5. Select preferred model

## Documentation

- **Development**: See [RUN_INSTRUCTIONS.md](RUN_INSTRUCTIONS.md)
- **Deployment**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **API**: Visit `/docs` endpoint when running

## Support

- **Issues**: Create GitHub issue
- **Discussions**: Use GitHub discussions
- **Documentation**: Check `/docs` folder
