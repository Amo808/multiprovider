#!/bin/bash

# Build and push AI Chat Docker images to Docker Hub
# Usage: ./docker-build.sh [version] [username]

VERSION=${1:-latest}
DOCKER_USERNAME=${2:-your-username}
IMAGE_NAME="ai-chat"

echo "Building AI Chat Docker images..."
echo "Version: $VERSION"
echo "Docker Username: $DOCKER_USERNAME"

# Build individual services
echo "Building backend image..."
docker build -f backend/Dockerfile.production -t $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION ./backend/

echo "Building frontend image..."
docker build -f frontend/Dockerfile.production -t $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION ./frontend/

# Build complete application
echo "Building complete application image..."
docker build -t $DOCKER_USERNAME/$IMAGE_NAME:$VERSION .

# Tag as latest if version is not latest
if [ "$VERSION" != "latest" ]; then
    docker tag $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION $DOCKER_USERNAME/$IMAGE_NAME-backend:latest
    docker tag $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION $DOCKER_USERNAME/$IMAGE_NAME-frontend:latest
    docker tag $DOCKER_USERNAME/$IMAGE_NAME:$VERSION $DOCKER_USERNAME/$IMAGE_NAME:latest
fi

echo "Built images:"
docker images | grep $DOCKER_USERNAME/$IMAGE_NAME

# Push to Docker Hub (uncomment after docker login)
read -p "Push to Docker Hub? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Pushing images to Docker Hub..."
    docker push $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION
    docker push $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION
    docker push $DOCKER_USERNAME/$IMAGE_NAME:$VERSION
    
    if [ "$VERSION" != "latest" ]; then
        docker push $DOCKER_USERNAME/$IMAGE_NAME-backend:latest
        docker push $DOCKER_USERNAME/$IMAGE_NAME-frontend:latest
        docker push $DOCKER_USERNAME/$IMAGE_NAME:latest
    fi
    
    echo "Images pushed successfully!"
    echo ""
    echo "To use these images:"
    echo "  Complete app: docker run -p 80:80 -p 8000:8000 $DOCKER_USERNAME/$IMAGE_NAME:$VERSION"
    echo "  Backend only: docker run -p 8000:8000 $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION"
    echo "  Frontend only: docker run -p 80:80 $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION"
fi
