@echo off
REM Docker deployment script for Windows

echo 🐳 Развертываем AI Chat с Docker на Windows...

REM Проверка Docker Desktop
docker version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker не установлен или не запущен.
    echo Установите Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Создание .env файла если не существует
if not exist "backend\.env" (
    echo 📝 Создаем .env файл...
    copy "backend\.env.example" "backend\.env"
    echo ⚠️  ВАЖНО: Отредактируйте файл backend\.env и добавьте ваши API ключи!
    echo    notepad backend\.env
    pause
)

REM Создание необходимых директорий
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "ssl" mkdir ssl

REM Остановка существующих контейнеров
echo 🛑 Остановка существующих контейнеров...
docker-compose down 2>nul

REM Сборка и запуск контейнеров
echo 🔨 Сборка Docker образов...
docker-compose build --no-cache

echo 🚀 Запуск контейнеров...
docker-compose up -d

REM Проверка статуса
echo 📊 Проверка статуса контейнеров...
docker-compose ps

echo.
echo 🎉 AI Chat успешно развернут!
echo.
echo 🔗 Приложение доступно по адресам:
echo    Frontend: http://localhost
echo    Backend API: http://localhost:8000
echo    API Docs: http://localhost:8000/docs
echo.
echo 📋 Полезные команды:
echo    docker-compose logs -f                 # Просмотр логов
echo    docker-compose ps                      # Статус контейнеров
echo    docker-compose restart                 # Перезапуск
echo    docker-compose down                    # Остановка
echo    docker-compose exec backend bash       # Консоль backend
echo.

pause
