#!/bin/bash

# AI Chat Deployment Script
# Quick deployment for Ubuntu/Debian systems

set -e

echo "🚀 AI Chat Deployment Starting..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js
echo "📦 Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install Python
echo "🐍 Installing Python..."
if ! command -v python3 &> /dev/null; then
    sudo apt install python3 python3-pip python3-venv -y
fi

# Install Docker (optional)
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
fi

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    sudo apt install docker-compose -y
fi

# Clone repository (if not already cloned)
if [ ! -d "multiprovider" ]; then
    echo "📥 Cloning repository..."
    git clone https://github.com/Amo808/multiprovider.git multiprovider
fi

cd multiprovider

# Create environment file
if [ ! -f ".env" ]; then
    echo "⚙️ Creating environment file..."
    cp .env.example .env
    echo "❗ Please edit .env file with your API keys before starting the application"
fi

# Build and start with Docker
echo "🚀 Building and starting application..."
docker-compose up --build -d

echo "✅ Deployment complete!"
echo "🌐 Application will be available at:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo ""
echo "📝 Next steps:"
echo "1. Edit .env file with your API keys"
echo "2. Restart: docker-compose restart"
echo "3. Configure your domain and SSL if needed"
