#!/bin/bash
# Docker deployment script

set -e

echo "🐳 Развертываем AI Chat с Docker..."

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Устанавливаем..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    sudo usermod -aG docker $USER
    echo "✅ Docker установлен. Перезайдите в систему для применения изменений."
    exit 1
fi

# Проверка Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose не установлен. Устанавливаем..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Создание .env файла если не существует
if [ ! -f backend/.env ]; then
    echo "📝 Создаем .env файл..."
    cp backend/.env.example backend/.env
    echo "⚠️  ВАЖНО: Отредактируйте файл backend/.env и добавьте ваши API ключи!"
    echo "   nano backend/.env"
fi

# Создание необходимых директорий
mkdir -p data logs ssl nginx/conf.d

# Остановка существующих контейнеров
echo "🛑 Остановка существующих контейнеров..."
docker-compose down 2>/dev/null || true

# Сборка и запуск контейнеров
echo "🔨 Сборка Docker образов..."
docker-compose build --no-cache

echo "🚀 Запуск контейнеров..."
docker-compose up -d

# Проверка статуса
echo "📊 Проверка статуса контейнеров..."
docker-compose ps

echo ""
echo "🎉 AI Chat успешно развернут!"
echo ""
echo "🔗 Приложение доступно по адресам:"
echo "   Frontend: http://localhost"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "📋 Полезные команды:"
echo "   docker-compose logs -f                 # Просмотр логов"
echo "   docker-compose ps                      # Статус контейнеров"
echo "   docker-compose restart                 # Перезапуск"
echo "   docker-compose down                    # Остановка"
echo "   docker-compose exec backend bash       # Консоль backend"
echo ""
