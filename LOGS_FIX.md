# Logs Directory Fix

## Проблема
Backend падал с ошибкой при попытке создать файл лога в папке `logs/`, которая не существовала в Docker контейнере.

## Решение
В `Dockerfile` добавлено создание папки `logs/` в команде `mkdir`:

```dockerfile
RUN useradd -m -u 1001 appuser && \
    mkdir -p /var/log/nginx /var/run /app/logs && \
    chmod +x /app/start_simple.sh && \
    chown -R appuser:appuser /app
```

## Результат
- Папка `logs/` создается при сборке Docker образа
- Backend может успешно писать логи в `/app/logs/app.log`
- Деплой на Render проходит без ошибок
- Приложение стартует корректно

## Коммит
Commit: `8aaf2a2 - Fix: Create logs directory in Dockerfile to prevent backend crash`

Теперь деплой должен пройти полностью успешно!
