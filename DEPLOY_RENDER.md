# 🚀 Deploy to Render - Step by Step

This guide will help you deploy the AI Chat application to Render with dev mode enabled (no Google Auth required).

## 📋 Prerequisites

1. **GitHub Repository**: Your code should be in a GitHub repository
2. **Render Account**: Sign up at [render.com](https://render.com)
3. **API Keys**: At least OpenAI API key

## 🔧 Current Configuration

The app is pre-configured for production deployment with dev mode:
- ✅ **Dev Mode Enabled**: No Google login required
- ✅ **High Performance Settings**: All reasoning settings set to maximum
- ✅ **Large Token Limits**: 131,072 max tokens for best output quality
- ✅ **All Providers Ready**: OpenAI, Anthropic, DeepSeek, Gemini support

## 🌐 Deploy Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Deploy-ready: dev mode enabled for production"
git push origin main
```

### 2. Create Render Service
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `ai-chat-app` (or your preferred name)
   - **Branch**: `main`
   - **Root Directory**: (leave empty)
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile`

### 3. Environment Variables
Add these in Render dashboard → Environment:

**Required:**
```
OPENAI_API_KEY=sk-your-openai-api-key-here
JWT_SECRET=your-random-secret-key-here
```

**Optional (for more providers):**
```
ANTHROPIC_API_KEY=your-anthropic-key
DEEPSEEK_API_KEY=your-deepseek-key
GEMINI_API_KEY=your-gemini-key
```

**Auto-configured (don't change):**
```
DEV_MODE=1
FORCE_DEV_AUTH=1
VITE_DEV_MODE=1
PORT=10000
HOST=0.0.0.0
```

### 4. Deploy
1. Click **"Deploy"**
2. Wait 5-10 minutes for build and deployment
3. Your app will be available at `https://your-app-name.onrender.com`

## 🎯 Features Available

### 🤖 AI Models
- **GPT-5** (primary) - Advanced reasoning
- **GPT-4o**, **GPT-4o Mini** - Fast and efficient
- **Claude Opus 4.1** - Anthropic's latest
- **DeepSeek V3.1** - Reasoning and chat modes
- **Gemini 2.5 Pro** - Google's thinking model

### ⚡ High Performance Settings
- **Verbosity**: High (detailed responses)
- **Reasoning Effort**: High (deep thinking)
- **Max Tokens**: 131,072 (very long responses)
- **Thinking Budget**: Dynamic (adaptive reasoning)

### 🔧 No Authentication Required
- Direct access to chat interface
- No Google login needed
- Perfect for testing and demos

## 🆘 Troubleshooting

### Build Fails
- Check that all files are committed to GitHub
- Verify Dockerfile is in project root
- Check Render build logs for specific errors

### App Won't Start
- Verify environment variables are set correctly
- Check that OPENAI_API_KEY is valid
- Look at Render logs for startup errors

### Chat Not Working
- Confirm OPENAI_API_KEY has sufficient credits
- Check browser console for frontend errors
- Verify app is accessible at the Render URL

## 🔄 Updates

To update your deployed app:
1. Make changes locally
2. Commit and push to GitHub
3. Render will auto-deploy (if enabled)

## 💡 Production Tips

1. **API Keys**: Store securely in Render dashboard, never in code
2. **Monitoring**: Use Render's built-in monitoring and logs
3. **Scaling**: Upgrade Render plan if you need more resources
4. **Custom Domain**: Add your own domain in Render settings

## 🎉 Success!

Once deployed, you'll have a fully functional AI chat application with:
- No login required
- Multiple AI providers
- Maximum performance settings
- Production-ready infrastructure

Access your app at: `https://your-app-name.onrender.com`
