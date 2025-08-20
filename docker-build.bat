@echo off
REM Build and push AI Chat Docker images to Docker Hub
REM Usage: docker-build.bat [version] [username]

set VERSION=%1
set DOCKER_USERNAME=%2

if "%VERSION%"=="" set VERSION=latest
if "%DOCKER_USERNAME%"=="" set DOCKER_USERNAME=your-username

set IMAGE_NAME=ai-chat

echo Building AI Chat Docker images...
echo Version: %VERSION%
echo Docker Username: %DOCKER_USERNAME%

REM Build individual services
echo Building backend image...
docker build -f backend/Dockerfile.production -t %DOCKER_USERNAME%/%IMAGE_NAME%-backend:%VERSION% ./backend/

echo Building frontend image...
docker build -f frontend/Dockerfile.production -t %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:%VERSION% ./frontend/

REM Build complete application
echo Building complete application image...
docker build -t %DOCKER_USERNAME%/%IMAGE_NAME%:%VERSION% .

REM Tag as latest if version is not latest
if not "%VERSION%"=="latest" (
    docker tag %DOCKER_USERNAME%/%IMAGE_NAME%-backend:%VERSION% %DOCKER_USERNAME%/%IMAGE_NAME%-backend:latest
    docker tag %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:%VERSION% %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:latest
    docker tag %DOCKER_USERNAME%/%IMAGE_NAME%:%VERSION% %DOCKER_USERNAME%/%IMAGE_NAME%:latest
)

echo Built images:
docker images | findstr %DOCKER_USERNAME%/%IMAGE_NAME%

REM Push to Docker Hub
set /p PUSH_CONFIRM=Push to Docker Hub? (y/n): 
if /i "%PUSH_CONFIRM%"=="y" (
    echo Pushing images to Docker Hub...
    docker push %DOCKER_USERNAME%/%IMAGE_NAME%-backend:%VERSION%
    docker push %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:%VERSION%
    docker push %DOCKER_USERNAME%/%IMAGE_NAME%:%VERSION%
    
    if not "%VERSION%"=="latest" (
        docker push %DOCKER_USERNAME%/%IMAGE_NAME%-backend:latest
        docker push %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:latest
        docker push %DOCKER_USERNAME%/%IMAGE_NAME%:latest
    )
    
    echo Images pushed successfully!
    echo.
    echo To use these images:
    echo   Complete app: docker run -p 80:80 -p 8000:8000 %DOCKER_USERNAME%/%IMAGE_NAME%:%VERSION%
    echo   Backend only: docker run -p 8000:8000 %DOCKER_USERNAME%/%IMAGE_NAME%-backend:%VERSION%
    echo   Frontend only: docker run -p 80:80 %DOCKER_USERNAME%/%IMAGE_NAME%-frontend:%VERSION%
)

pause
