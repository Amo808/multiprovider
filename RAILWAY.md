# Railway Deployment Instructions

## Automatic Deploy (Recommended)

### Option 1: Connect GitHub Repository

1. **Go to [Railway.app](https://railway.app)**
2. **Sign up/Login** (preferably with GitHub)
3. **Click "Deploy Now"**
4. **Select "Deploy from GitHub repo"**
5. **Connect your GitHub account and select `Amo808/mulitchat`**
6. **Railway will automatically detect Dockerfile and deploy**

### Option 2: Deploy Button (One Click)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/Ub6Ohk)

### Option 3: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy from current directory
railway up
```

## Environment Variables

After deployment, add these environment variables in Railway dashboard:

```env
# Required
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
DEEPSEEK_API_KEY=your-deepseek-key-here

# Optional
GOOGLE_API_KEY=your-google-key-here
COHERE_API_KEY=your-cohere-key-here
PORT=80
PYTHONUNBUFFERED=1
```

## Configuration

Railway will:
- ✅ Automatically build using Dockerfile
- ✅ Expose the app on port 80
- ✅ Provide HTTPS domain
- ✅ Auto-deploy on git push
- ✅ Scale automatically

## Access Your App

After deployment:
- **App URL**: `https://your-app-name.railway.app`
- **API Docs**: `https://your-app-name.railway.app/docs`
- **Health Check**: `https://your-app-name.railway.app/health`

## Monitoring

Railway provides:
- Real-time logs
- Metrics dashboard
- Resource usage monitoring
- Deployment history

## Custom Domain

To use custom domain:
1. Go to Railway dashboard
2. Select your service
3. Settings → Domains
4. Add custom domain
5. Update DNS records

## Costs

- **Free tier**: $5/month in usage credits
- **Pay as you use**: ~$5-20/month for typical usage
- **Auto-scaling**: Scales to zero when not used

## Troubleshooting

### Deployment fails
- Check logs in Railway dashboard
- Verify Dockerfile syntax
- Ensure all dependencies are included

### App doesn't start
- Check environment variables are set
- Verify PORT is set to 80
- Check health endpoint responds

### API errors
- Verify API keys are correctly set
- Check key formats and permissions
- Monitor logs for detailed errors
