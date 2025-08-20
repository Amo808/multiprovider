#!/bin/bash

# Universal Docker Hub Build Script
# Собирает образы с универсальным именем для публикации

echo "🐳 Building AI Chat Docker images for Docker Hub..."

# Универсальное имя для публикации
IMAGE_NAME="aichatapp"
VERSION="latest"

echo "Building images as: $IMAGE_NAME/*:$VERSION"

# Build backend
echo "📦 Building backend image..."
docker build -f backend/Dockerfile.production -t $IMAGE_NAME/backend:$VERSION ./backend/

if [ $? -ne 0 ]; then
    echo "❌ Backend build failed"
    exit 1
fi

# Build frontend
echo "📦 Building frontend image..."
docker build -f frontend/Dockerfile.production -t $IMAGE_NAME/frontend:$VERSION ./frontend/

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi

# Build complete app
echo "📦 Building complete application image..."
docker build -t $IMAGE_NAME/complete:$VERSION .

if [ $? -ne 0 ]; then
    echo "❌ Complete app build failed"
    exit 1
fi

echo "✅ All images built successfully!"
echo ""
echo "📋 Built images:"
docker images | grep $IMAGE_NAME

echo ""
echo "🚀 To push to Docker Hub:"
echo "docker push $IMAGE_NAME/backend:$VERSION"
echo "docker push $IMAGE_NAME/frontend:$VERSION" 
echo "docker push $IMAGE_NAME/complete:$VERSION"

echo ""
echo "💡 Usage examples:"
echo "Complete app: docker run -p 80:80 -p 8000:8000 $IMAGE_NAME/complete:$VERSION"
echo "Backend only: docker run -p 8000:8000 $IMAGE_NAME/backend:$VERSION"
echo "Frontend only: docker run -p 80:80 $IMAGE_NAME/frontend:$VERSION"
