#!/bin/bash
# Автоматическая установка AI Chat на Ubuntu сервер

set -e  # Exit on any error

echo "🚀 Начинаем установку AI Chat..."

# Обновление системы
echo "📦 Обновляем систему..."
sudo apt update && sudo apt upgrade -y

# Установка необходимых пакетов
echo "📦 Устанавливаем необходимые пакеты..."
sudo apt install -y python3.11 python3.11-venv python3-pip nginx git curl

# Установка Node.js 18
echo "📦 Устанавливаем Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PM2
echo "📦 Устанавливаем PM2..."
sudo npm install -g pm2

# Создание пользователя (если не существует)
if ! id "aiChat" &>/dev/null; then
    echo "👤 Создаем пользователя aiChat..."
    sudo adduser --disabled-password --gecos "" aiChat
    sudo usermod -aG sudo aiChat
fi

# Переключение на пользователя aiChat
echo "🔄 Переключаемся на пользователя aiChat..."
sudo -u aiChat bash << 'EOF'
cd /home/aiChat

# Клонирование или копирование проекта
echo "📂 Настраиваем проект..."
# ЗАМЕНИТЕ на ваш способ получения файлов проекта
# git clone YOUR_REPO_URL ai-chat
# или
# scp -r user@local:/path/to/ai-chat ./

# Настройка Backend
echo "🐍 Настраиваем Python backend..."
cd ai-chat/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Настройка переменных окружения
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  ВАЖНО: Отредактируйте файл .env и добавьте ваши API ключи!"
    echo "   nano /home/aiChat/ai-chat/backend/.env"
fi

# Настройка Frontend
echo "⚛️  Настраиваем React frontend..."
cd ../frontend
npm install
npm run build

echo "✅ Установка завершена!"
EOF

# Настройка Nginx
echo "🌐 Настраиваем Nginx..."
sudo cp /home/aiChat/ai-chat/nginx.conf /etc/nginx/sites-available/ai-chat

# Активация конфигурации
sudo ln -sf /etc/nginx/sites-available/ai-chat /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Настройка PM2
echo "⚙️  Настраиваем PM2..."
sudo -u aiChat bash << 'EOF'
cd /home/aiChat/ai-chat
pm2 start pm2.config.json
pm2 startup
EOF

# Сохранение конфигурации PM2
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u aiChat --hp /home/aiChat
sudo -u aiChat pm2 save

# Настройка файрвола
echo "🔥 Настраиваем файрвол..."
sudo ufw --force enable
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Перезапуск сервисов
sudo systemctl reload nginx
sudo systemctl enable nginx

echo ""
echo "🎉 Установка AI Chat завершена!"
echo ""
echo "📋 Что нужно сделать дальше:"
echo "1. Отредактируйте файл .env: nano /home/aiChat/ai-chat/backend/.env"
echo "2. Добавьте ваши API ключи от AI провайдеров"
echo "3. Замените YOUR_DOMAIN.COM в nginx.conf на ваш домен"
echo "4. Настройте SSL: sudo certbot --nginx -d YOUR_DOMAIN.COM"
echo ""
echo "🔗 Приложение доступно по адресу: http://YOUR_SERVER_IP"
echo "📊 Мониторинг PM2: sudo -u aiChat pm2 status"
echo "📝 Логи: sudo -u aiChat pm2 logs"
echo ""
