# Deployment Guide - Гид по развертыванию на сервере

## Выбор сервера

### Рекомендуемые провайдеры VPS:
1. **Selectel** (Россия) - от 500₽/мес, надежный
2. **TimeWeb** (Россия) - от 300₽/мес, хорошая поддержка  
3. **DigitalOcean** (США) - $5/мес, простой интерфейс
4. **Hetzner** (Германия) - от €3/мес, очень дешево

### Минимальные требования:
- **CPU**: 2 ядра
- **RAM**: 4 GB
- **Диск**: 40 GB SSD
- **ОС**: Ubuntu 22.04 LTS

## Настройка сервера

### 1. Подключение к серверу
```bash
ssh root@YOUR_SERVER_IP
```

### 2. Обновление системы
```bash
apt update && apt upgrade -y
```

### 3. Установка необходимого ПО
```bash
# Python 3.11
apt install python3.11 python3.11-venv python3-pip -y

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# Nginx (веб-сервер)
apt install nginx -y

# PM2 (менеджер процессов)
npm install -g pm2

# Git
apt install git -y
```

### 4. Создание пользователя для приложения
```bash
adduser aiChat
usermod -aG sudo aiChat
su - aiChat
```

## Развертывание приложения

### 1. Клонирование проекта
```bash
cd /home/aiChat
# Загрузите ваш проект (через git, scp, или другим способом)
```

### 2. Настройка Backend
```bash
cd ai-chat/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Создание .env файла
cp .env.example .env
nano .env  # Добавьте ваши API ключи
```

### 3. Настройка Frontend
```bash
cd ../frontend
npm install
npm run build  # Создание production сборки
```

## Конфигурация для production

### 1. Настройка Backend для production
Создайте файл `backend/start.sh`:
```bash
#!/bin/bash
cd /home/aiChat/ai-chat/backend
source .venv/bin/activate
python main.py --host 0.0.0.0 --port 8000
```

### 2. Настройка PM2
```bash
# Запуск backend через PM2
cd /home/aiChat/ai-chat/backend
pm2 start main.py --name "ai-chat-backend" --interpreter python3

# Автозапуск при перезагрузке сервера
pm2 startup
pm2 save
```

### 3. Настройка Nginx
Создайте конфиг `/etc/nginx/sites-available/ai-chat`:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.COM;  # или IP адрес
    
    # Frontend (статические файлы)
    location / {
        root /home/aiChat/ai-chat/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Активируйте конфиг:
```bash
ln -s /etc/nginx/sites-available/ai-chat /etc/nginx/sites-enabled/
nginx -t  # Проверка конфигурации
systemctl reload nginx
```

## SSL сертификат (HTTPS)

### Установка Certbot для бесплатного SSL:
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d YOUR_DOMAIN.COM
```

## Мониторинг и логи

### Просмотр статуса:
```bash
pm2 status           # Статус приложений
pm2 logs ai-chat-backend  # Логи backend
systemctl status nginx    # Статус Nginx
```

### Перезапуск сервисов:
```bash
pm2 restart ai-chat-backend  # Перезапуск backend
systemctl reload nginx       # Перезапуск Nginx
```

## Безопасность

### 1. Настройка файрвола
```bash
ufw enable
ufw allow ssh
ufw allow 'Nginx Full'
```

### 2. Создание бэкапов
```bash
# Создайте скрипт для бэкапа data/
#!/bin/bash
tar -czf /home/aiChat/backup-$(date +%Y%m%d).tar.gz /home/aiChat/ai-chat/data/
```

## Обновление приложения

```bash
cd /home/aiChat/ai-chat
git pull  # Если используете git
pm2 restart ai-chat-backend  # Перезапуск backend

# Если обновился frontend:
cd frontend
npm run build
```

## Стоимость

### Примерный месячный бюджет:
- **VPS** (Selectel/TimeWeb): 500-1000₽
- **Домен** (.ru/.com): 100-500₽/год  
- **SSL сертификат**: Бесплатно (Let's Encrypt)

**Итого: ~600-1100₹/мес**

## Поддержка и мониторинг

1. **Логи** - регулярно проверяйте `pm2 logs`
2. **Бэкапы** - настройте автоматическое резервное копирование `data/`
3. **Обновления** - следите за обновлениями системы и зависимостей
4. **Мониторинг** - используйте `htop`, `pm2 monit` для контроля ресурсов
