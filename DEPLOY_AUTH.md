# 🔐 (DEPRECATED) Парольная аутентификация

Этот документ относится к устаревшей системе доступа по паролю (ACCESS_PASSWORD), которая заменена на Google OAuth 2.0 + JWT.

## ✅ Текущий метод аутентификации
- **Google OAuth 2.0** (frontend получает Google ID token)
- **Backend** проверяет токен и выдает собственный **JWT**
- Все защищенные эндпоинты теперь требуют заголовок: `Authorization: Bearer <jwt>`

## ❌ Что удалено
- Переменная окружения `ACCESS_PASSWORD`
- Эндпоинт `/auth/login` (возвращал 410, теперь полностью удалён)
- Локальное хранение `access_password` в браузере

## 🆕 Новые переменные окружения
```
GOOGLE_CLIENT_ID=ваш_google_client_id
JWT_SECRET=случайная_длинная_строка
JWT_EXPIRES=60   # (минуты, опционально)
```

## 🚀 Процесс входа сейчас
1. Пользователь нажимает кнопку "Sign in with Google"
2. Фронтенд получает `credential` (Google ID token)
3. Отправляет POST `/auth/google { id_token }`
4. Backend возвращает `access_token` (JWT)
5. JWT кладётся в `localStorage` как `jwt_token`
6. Все запросы к `/api/...` отправляются с `Authorization: Bearer <jwt>`

## 🗂 План миграции выполнен
- Код паролей удалён из backend
- Конфиги Render обновлены (`render.yaml` без ACCESS_PASSWORD)
- Документация помечена как deprecated

## 📌 Если нужен полный logout
Удалить `jwt_token` из `localStorage` и перезагрузить страницу.

---
Исторический раздел ниже сохранён только для справки.

<details>
<summary>Старая документация (legacy)</summary>

## (LEGACY) Система аутентификации по паролю
(Удалена)

</details>
