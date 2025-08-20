#!/bin/bash

# Quick deploy script using Docker Hub images
# Usage: ./deploy-hub.sh [docker-username] [version]

DOCKER_USERNAME=${1:-your-username}
VERSION=${2:-latest}

echo "🚀 Deploying AI Chat from Docker Hub..."
echo "Username: $DOCKER_USERNAME"
echo "Version: $VERSION"

# Create necessary directories
mkdir -p data logs storage

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
DOCKER_USERNAME=$DOCKER_USERNAME
VERSION=$VERSION
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
DEEPSEEK_API_KEY=your-deepseek-api-key-here
EOF
    echo "⚠️  Please edit .env file with your API keys!"
fi

# Download docker-compose file if it doesn't exist
if [ ! -f docker-compose.hub.yml ]; then
    echo "📥 Downloading docker-compose.hub.yml..."
    curl -o docker-compose.hub.yml https://raw.githubusercontent.com/YOUR_REPO/ai-chat/main/docker-compose.hub.yml
fi

# Pull and start containers
echo "📦 Pulling images from Docker Hub..."
docker-compose -f docker-compose.hub.yml pull

echo "🔄 Starting containers..."
docker-compose -f docker-compose.hub.yml up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
if docker-compose -f docker-compose.hub.yml ps | grep -q "Up"; then
    echo "✅ AI Chat is running!"
    echo "🌐 Frontend: http://localhost"
    echo "🔧 Backend: http://localhost:8000"
    echo "📊 Health: http://localhost/health"
    echo ""
    echo "📝 To edit API keys: nano .env && docker-compose -f docker-compose.hub.yml restart"
    echo "📜 To view logs: docker-compose -f docker-compose.hub.yml logs -f"
    echo "🛑 To stop: docker-compose -f docker-compose.hub.yml down"
else
    echo "❌ Something went wrong. Check logs:"
    docker-compose -f docker-compose.hub.yml logs
fi
