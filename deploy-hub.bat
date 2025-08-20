@echo off
REM Quick deploy script using Docker Hub images
REM Usage: deploy-hub.bat [docker-username] [version]

set DOCKER_USERNAME=%1
set VERSION=%2

if "%DOCKER_USERNAME%"=="" set DOCKER_USERNAME=your-username
if "%VERSION%"=="" set VERSION=latest

echo 🚀 Deploying AI Chat from Docker Hub...
echo Username: %DOCKER_USERNAME%
echo Version: %VERSION%

REM Create necessary directories
if not exist "data" mkdir data
if not exist "logs" mkdir logs  
if not exist "storage" mkdir storage

REM Create .env file if it doesn't exist
if not exist ".env" (
    echo 📝 Creating .env file...
    (
        echo DOCKER_USERNAME=%DOCKER_USERNAME%
        echo VERSION=%VERSION%
        echo OPENAI_API_KEY=your-openai-api-key-here
        echo ANTHROPIC_API_KEY=your-anthropic-api-key-here
        echo DEEPSEEK_API_KEY=your-deepseek-api-key-here
    ) > .env
    echo ⚠️  Please edit .env file with your API keys!
)

REM Download docker-compose file if it doesn't exist
if not exist "docker-compose.hub.yml" (
    echo 📥 Downloading docker-compose.hub.yml...
    curl -o docker-compose.hub.yml https://raw.githubusercontent.com/YOUR_REPO/ai-chat/main/docker-compose.hub.yml
)

REM Pull and start containers
echo 📦 Pulling images from Docker Hub...
docker-compose -f docker-compose.hub.yml pull

echo 🔄 Starting containers...
docker-compose -f docker-compose.hub.yml up -d

REM Wait for services to start
echo ⏳ Waiting for services to start...
timeout /t 10 /nobreak >nul

REM Check if services are running
docker-compose -f docker-compose.hub.yml ps | findstr "Up" >nul
if %errorlevel%==0 (
    echo ✅ AI Chat is running!
    echo 🌐 Frontend: http://localhost
    echo 🔧 Backend: http://localhost:8000
    echo 📊 Health: http://localhost/health
    echo.
    echo 📝 To edit API keys: notepad .env && docker-compose -f docker-compose.hub.yml restart
    echo 📜 To view logs: docker-compose -f docker-compose.hub.yml logs -f
    echo 🛑 To stop: docker-compose -f docker-compose.hub.yml down
) else (
    echo ❌ Something went wrong. Check logs:
    docker-compose -f docker-compose.hub.yml logs
)

pause
