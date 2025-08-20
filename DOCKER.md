# Docker Deployment - Развертывание с Docker

## Преимущества Docker развертывания

✅ **Простая установка** - один скрипт для всего  
✅ **Изолированная среда** - нет конфликтов с системой  
✅ **Легкое обновление** - пересобрать и перезапустить  
✅ **Масштабируемость** - легко добавлять сервисы  
✅ **Переносимость** - работает на любом сервере  

## Быстрый старт

### 1. Подготовка

**На Linux/macOS:**
```bash
# Скачать и запустить
wget https://raw.githubusercontent.com/YOUR_REPO/ai-chat/main/deploy-docker.sh
chmod +x deploy-docker.sh
./deploy-docker.sh
```

**На Windows:**
```cmd
# Скачать deploy-docker.bat и запустить
deploy-docker.bat
```

### 2. Настройка API ключей
```bash
# Отредактировать .env файл
nano backend/.env
```

Добавьте ваши API ключи:
```env
DEEPSEEK_API_KEY=your_actual_api_key_here
OPENAI_API_KEY=your_actual_api_key_here
```

### 3. Перезапуск после настройки
```bash
docker-compose restart backend
```

## Структура Docker контейнеров

```
ai-chat-docker/
├── ai-chat-frontend    # Nginx + React приложение (порт 80)
├── ai-chat-backend     # FastAPI сервер (порт 8000) 
└── ai-chat-redis       # Redis для кеширования (порт 6379)
```

## Команды управления

### Основные команды:
```bash
# Запуск всех сервисов
docker-compose up -d

# Остановка всех сервисов  
docker-compose down

# Перезапуск всех сервисов
docker-compose restart

# Просмотр статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Просмотр логов конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Обслуживание:
```bash
# Обновление образов
docker-compose pull
docker-compose up -d

# Полная пересборка
docker-compose build --no-cache
docker-compose up -d

# Очистка неиспользуемых образов
docker system prune -a

# Вход в контейнер backend
docker-compose exec backend bash

# Просмотр использования ресурсов
docker stats
```

## Production развертывание

### 1. Для production используйте:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 2. SSL сертификаты:
```bash
# Установка Certbot в контейнер
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt \
  -p 80:80 \
  certbot/certbot certonly --standalone \
  -d your-domain.com
```

### 3. Настройка домена:
Замените `YOUR_DOMAIN.COM` в файлах конфигурации на ваш реальный домен.

## Конфигурация для разных окружений

### Development (локальная разработка):
```bash
docker-compose -f docker-compose.yml up -d
```

### Production (боевой сервер):
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Staging (тестовый сервер):
```bash
docker-compose -f docker-compose.staging.yml up -d
```

## Мониторинг и логи

### Централизованные логи:
```bash
# Все логи в одном месте
docker-compose logs -f --tail=100

# Только ошибки
docker-compose logs -f --tail=50 | grep ERROR

# Логи определенного времени
docker-compose logs -f --since="2024-01-01T00:00:00"
```

### Мониторинг ресурсов:
```bash
# Использование CPU/RAM
docker stats

# Размер контейнеров
docker system df

# Детальная информация о контейнере
docker inspect ai-chat-backend
```

## Бэкапы и восстановление

### Создание бэкапа:
```bash
# Бэкап данных
docker run --rm \
  -v ai-chat_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/backup-$(date +%Y%m%d).tar.gz /data

# Бэкап базы Redis
docker-compose exec redis redis-cli BGSAVE
docker cp ai-chat-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

### Восстановление:
```bash
# Восстановление данных
docker run --rm \
  -v ai-chat_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/backup-20240101.tar.gz -C /
```

## Масштабирование

### Горизонтальное масштабирование:
```bash
# Запуск нескольких экземпляров backend
docker-compose up -d --scale backend=3

# С балансировщиком нагрузки
docker-compose -f docker-compose.scale.yml up -d
```

## Безопасность

### Рекомендации:
1. **Не храните секреты в образах**
2. **Используйте .env файлы для переменных**
3. **Регулярно обновляйте базовые образы**
4. **Ограничивайте ресурсы контейнеров**

### Настройка ограничений:
```yaml
# В docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          memory: 256M
```

## Решение проблем

### Частые проблемы:

**Контейнер не запускается:**
```bash
docker-compose logs backend
```

**Нет доступа к приложению:**
```bash
# Проверить порты
docker-compose ps
netstat -tlnp | grep :80
```

**Проблемы с разрешениями:**
```bash
# Исправить права на папки
sudo chown -R $USER:$USER data logs
```

**Не хватает места на диске:**
```bash
# Очистить неиспользуемые образы
docker system prune -a -f
```

## Обновление приложения

### Простое обновление:
```bash
# 1. Остановить контейнеры
docker-compose down

# 2. Обновить код (git pull или загрузка)
git pull origin main

# 3. Пересобрать и запустить
docker-compose build --no-cache
docker-compose up -d
```

### Zero-downtime обновление:
```bash
# Blue-green deployment подход
docker-compose -p ai-chat-new up -d
# Переключение трафика через балансировщик
docker-compose -p ai-chat-old down
```

## Стоимость

### Серверные требования для Docker:
- **CPU**: 2+ ядра
- **RAM**: 4+ GB  
- **Диск**: 40+ GB SSD
- **Сеть**: 100+ Mbps

### Экономия ресурсов:
Docker оптимизирует использование ресурсов за счет разделения слоев образов и эффективного кэширования.
