@echo off
REM Universal Docker Hub Build Script
REM Собирает образы с универсальным именем для публикации

echo 🐳 Building AI Chat Docker images for Docker Hub...

REM Универсальное имя для публикации
set IMAGE_NAME=aichatapp
set VERSION=latest

echo Building images as: %IMAGE_NAME%/*:%VERSION%

REM Build backend
echo 📦 Building backend image...
docker build -f backend/Dockerfile.production -t %IMAGE_NAME%/backend:%VERSION% ./backend/

if %errorlevel% neq 0 (
    echo ❌ Backend build failed
    pause
    exit /b 1
)

REM Build frontend  
echo 📦 Building frontend image...
docker build -f frontend/Dockerfile.production -t %IMAGE_NAME%/frontend:%VERSION% ./frontend/

if %errorlevel% neq 0 (
    echo ❌ Frontend build failed
    pause
    exit /b 1
)

REM Build complete app
echo 📦 Building complete application image...
docker build -t %IMAGE_NAME%/complete:%VERSION% .

if %errorlevel% neq 0 (
    echo ❌ Complete app build failed
    pause
    exit /b 1
)

echo ✅ All images built successfully!
echo.
echo 📋 Built images:
docker images | findstr %IMAGE_NAME%

echo.
echo 🚀 To push to Docker Hub:
echo docker push %IMAGE_NAME%/backend:%VERSION%
echo docker push %IMAGE_NAME%/frontend:%VERSION%
echo docker push %IMAGE_NAME%/complete:%VERSION%

echo.
echo 💡 Usage examples:
echo Complete app: docker run -p 80:80 -p 8000:8000 %IMAGE_NAME%/complete:%VERSION%
echo Backend only: docker run -p 8000:8000 %IMAGE_NAME%/backend:%VERSION%
echo Frontend only: docker run -p 80:80 %IMAGE_NAME%/frontend:%VERSION%

pause
