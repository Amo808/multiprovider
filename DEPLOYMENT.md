# Deployment Guide

Professional deployment guide for AI Chat application on various cloud platforms.

## Quick Deploy Options

### 🐳 Docker (Recommended)

**One-command deployment:**
```bash
# Clone and deploy
git clone <your-repository-url>
cd ai-chat
docker-compose up --build
```

**Environment configuration:**
```bash
# Create .env file
OPENAI_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
```

### ☁️ Cloud Platforms

## Render.com (Free Tier Available)

1. **Connect Repository**
   - Go to [render.com](https://render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - Build Command: `npm install && npm run build`
   - Start Command: Auto-detected from Dockerfile
   - Environment Variables: Add your API keys

3. **Deploy**
   - Render will auto-build and deploy
   - Your app will be available at `https://your-app.onrender.com`

## Vercel (Frontend) + Railway (Backend)

### Frontend on Vercel:
```bash
# Deploy frontend
cd frontend
npx vercel

# Set environment variables
vercel env add VITE_API_URL https://your-backend.railway.app
```

### Backend on Railway:
1. Connect GitHub repository
2. Select backend folder
3. Add environment variables
4. Deploy automatically

## Railway (Full-Stack)

1. **One-click deploy:**
   [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/your-repo/ai-chat)

2. **Manual deployment:**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli

   # Login and deploy
   railway login
   railway new
   railway up
   ```

## Fly.io

```bash
# Install flyctl
# macOS: brew install flyctl
# Windows: iwr https://fly.io/install.ps1 -useb | iex

# Deploy
flyctl launch
flyctl deploy
```

## VPS Deployment

### Ubuntu/Debian Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python
sudo apt install python3 python3-pip python3-venv -y

# Install Nginx
sudo apt install nginx -y

# Clone repository
git clone <your-repository-url>
cd ai-chat

# Setup backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd ../frontend
npm install
npm run build

# Configure Nginx
sudo cp nginx.conf /etc/nginx/sites-available/ai-chat
sudo ln -s /etc/nginx/sites-available/ai-chat /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

### Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Start backend
cd backend
pm2 start main.py --name ai-chat-backend --interpreter python3

# Start frontend (if not using Nginx static)
cd frontend
pm2 start "npm run preview" --name ai-chat-frontend

# Save PM2 configuration
pm2 save
pm2 startup
```

## Environment Configuration

### Production Environment Variables

```bash
# Required API Keys
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
GOOGLE_API_KEY=...

# Application Settings
NODE_ENV=production
PORT=8000
FRONTEND_URL=https://yourdomain.com

# Database (if using external)
DATABASE_URL=postgresql://user:pass@host:port/db

# CORS Settings
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# SSL/Security
FORCE_HTTPS=true
SESSION_SECRET=your-secret-key
```

## Domain & SSL Setup

### Cloudflare (Recommended)

1. **Add domain to Cloudflare**
2. **Configure DNS:**
   ```
   A    @       your-server-ip
   A    www     your-server-ip
   ```
3. **Enable SSL:** Full (strict)
4. **Enable caching:** Custom rules for static assets

### Let's Encrypt (Manual)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Database Configuration

### SQLite (Default)
- No additional setup required
- Suitable for small to medium deployments
- Data stored in `/data/conversations.db`

### PostgreSQL (Recommended for production)
```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE ai_chat;
CREATE USER ai_chat_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ai_chat TO ai_chat_user;
\q

# Update environment
DATABASE_URL=postgresql://ai_chat_user:your_password@localhost:5432/ai_chat
```

## Monitoring & Logs

### Application Monitoring
```bash
# View logs
pm2 logs ai-chat-backend
pm2 logs ai-chat-frontend

# Monitor processes
pm2 monit

# View system resources
htop
df -h
```

### Log Rotation
```bash
# Configure logrotate
sudo nano /etc/logrotate.d/ai-chat

# Add configuration:
/path/to/ai-chat/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    notifempty
    create 644 your-user your-user
}
```

## Backup Strategy

### Database Backup
```bash
# SQLite backup
cp /path/to/ai-chat/data/conversations.db /backup/location/

# PostgreSQL backup
pg_dump ai_chat > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Configuration Backup
```bash
# Backup entire application
tar -czf ai-chat-backup-$(date +%Y%m%d).tar.gz \
    /path/to/ai-chat \
    --exclude=node_modules \
    --exclude=.venv \
    --exclude=logs
```

## Performance Optimization

### Frontend Optimization
```bash
# Build with optimizations
npm run build

# Enable Gzip in Nginx
gzip on;
gzip_types text/css application/javascript application/json;
```

### Backend Optimization
```bash
# Use production WSGI server
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### Caching Strategy
- Use Redis for session storage
- Implement CDN for static assets
- Cache API responses where appropriate

## Security Checklist

- ✅ Use HTTPS everywhere
- ✅ Set secure environment variables
- ✅ Configure firewall (UFW)
- ✅ Regular security updates
- ✅ Monitor access logs
- ✅ Use strong passwords
- ✅ Backup regularly

## Troubleshooting

### Common Issues

**502 Bad Gateway:**
- Check if backend is running
- Verify Nginx configuration
- Check firewall settings

**API Keys not working:**
- Verify environment variables are set
- Check API key format and permissions
- Test connections in provider settings

**Performance issues:**
- Monitor resource usage
- Check database performance
- Optimize frontend bundle size

### Support Resources

- Application logs: `/logs/app.log`
- Nginx logs: `/var/log/nginx/`
- System logs: `journalctl -u your-service`
